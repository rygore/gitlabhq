# frozen_string_literal: true
require 'mime/types'

module API
  class Commits < ::API::Base
    include PaginationParams

    feature_category :source_code_management

    before do
      require_repository_enabled!
      authorize! :download_code, user_project
    end

    helpers do
      def user_access
        @user_access ||= Gitlab::UserAccess.new(current_user, container: user_project)
      end

      def authorize_push_to_branch!(branch)
        unless user_access.can_push_to_branch?(branch)
          forbidden!("You are not allowed to push into this branch!")
        end
      end
    end

    params do
      requires :id, type: String, desc: 'The ID of a project'
    end
    resource :projects, requirements: API::NAMESPACE_OR_PROJECT_REQUIREMENTS, urgency: :low do
      desc 'Get a project repository commits' do
        success Entities::Commit
      end
      params do
        optional :ref_name, type: String, desc: 'The name of a repository branch or tag, if not given the default branch is used'
        optional :since, type: DateTime, desc: 'Only commits after or on this date will be returned'
        optional :until, type: DateTime, desc: 'Only commits before or on this date will be returned'
        optional :path, type: String, desc: 'The file path'
        optional :all, type: Boolean, desc: 'Every commit will be returned'
        optional :with_stats, type: Boolean, desc: 'Stats about each commit will be added to the response'
        optional :first_parent, type: Boolean, desc: 'Only include the first parent of merges'
        optional :order, type: String, desc: 'List commits in order', default: 'default', values: %w[default topo]
        optional :trailers, type: Boolean, desc: 'Parse and include Git trailers for every commit', default: false
        use :pagination
      end
      get ':id/repository/commits', urgency: :low do
        path = params[:path]
        before = params[:until]
        after = params[:since]
        ref = params[:ref_name].presence || user_project.default_branch unless params[:all]
        offset = (params[:page] - 1) * params[:per_page]
        all = params[:all]
        with_stats = params[:with_stats]
        first_parent = params[:first_parent]
        order = params[:order]

        commits = user_project.repository.commits(ref,
                                                  path: path,
                                                  limit: params[:per_page],
                                                  offset: offset,
                                                  before: before,
                                                  after: after,
                                                  all: all,
                                                  first_parent: first_parent,
                                                  order: order,
                                                  trailers: params[:trailers])

        serializer = with_stats ? Entities::CommitWithStats : Entities::Commit

        # This tells kaminari that there is 1 more commit after the one we've
        # loaded, meaning there will be a next page, if the currently loaded set
        # of commits is equal to the requested page size.
        commit_count = offset + commits.size + 1
        paginated_commits = Kaminari.paginate_array(commits, total_count: commit_count)

        present paginate(paginated_commits, exclude_total_headers: true), with: serializer
      end

      desc 'Commit multiple file changes as one commit' do
        success Entities::CommitDetail
        detail 'This feature was introduced in GitLab 8.13'
      end
      params do
        requires :branch, type: String, desc: 'Name of the branch to commit into. To create a new branch, also provide either `start_branch` or `start_sha`, and optionally `start_project`.', allow_blank: false
        requires :commit_message, type: String, desc: 'Commit message'
        requires :actions, type: Array, desc: 'Actions to perform in commit' do
          requires :action, type: String, desc: 'The action to perform, `create`, `delete`, `move`, `update`, `chmod`', values: %w[create update move delete chmod].freeze
          requires :file_path, type: String, desc: 'Full path to the file. Ex. `lib/class.rb`'
          given action: ->(action) { action == 'move' } do
            requires :previous_path, type: String, desc: 'Original full path to the file being moved. Ex. `lib/class1.rb`'
          end
          given action: ->(action) { %w[create move].include? action } do
            optional :content, type: String, desc: 'File content'
          end
          given action: ->(action) { action == 'update' } do
            requires :content, type: String, desc: 'File content'
          end
          optional :encoding, type: String, desc: '`text` or `base64`', default: 'text', values: %w[text base64]
          given action: ->(action) { %w[update move delete].include? action } do
            optional :last_commit_id, type: String, desc: 'Last known file commit id'
          end
          given action: ->(action) { action == 'chmod' } do
            requires :execute_filemode, type: Boolean, desc: 'When `true/false` enables/disables the execute flag on the file.'
          end
        end

        optional :start_branch, type: String, desc: 'Name of the branch to start the new branch from'
        optional :start_sha, type: String, desc: 'SHA of the commit to start the new branch from'
        mutually_exclusive :start_branch, :start_sha

        optional :start_project, types: [Integer, String], desc: 'The ID or path of the project to start the new branch from'
        optional :author_email, type: String, desc: 'Author email for commit'
        optional :author_name, type: String, desc: 'Author name for commit'
        optional :stats, type: Boolean, default: true, desc: 'Include commit stats'
        optional :force, type: Boolean, default: false, desc: 'When `true` overwrites the target branch with a new commit based on the `start_branch` or `start_sha`'
      end
      post ':id/repository/commits' do
        if params[:start_project]
          start_project = find_project!(params[:start_project])

          unless user_project.forked_from?(start_project)
            forbidden!("Project is not included in the fork network for #{start_project.full_name}")
          end
        end

        authorize_push_to_branch!(params[:branch])

        attrs = declared_params
        attrs[:branch_name] = attrs.delete(:branch)
        attrs[:start_branch] ||= attrs[:branch_name] unless attrs[:start_sha]
        attrs[:start_project] = start_project if start_project

        result = ::Files::MultiService.new(user_project, current_user, attrs).execute

        if result[:status] == :success
          commit_detail = user_project.repository.commit(result[:result])

          if find_user_from_warden
            Gitlab::UsageDataCounters::WebIdeCounter.increment_commits_count
            Gitlab::UsageDataCounters::EditorUniqueCounter.track_web_ide_edit_action(author: current_user)
          end

          present commit_detail, with: Entities::CommitDetail, stats: params[:stats]
        else
          render_api_error!(result[:message], 400)
        end
      end

      desc 'Get a specific commit of a project' do
        success Entities::CommitDetail
        failure [[404, 'Commit Not Found']]
      end
      params do
        requires :sha, type: String, desc: 'A commit sha, or the name of a branch or tag'
        optional :stats, type: Boolean, default: true, desc: 'Include commit stats'
      end
      get ':id/repository/commits/:sha', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS do
        commit = user_project.commit(params[:sha])

        not_found! 'Commit' unless commit

        present commit, with: Entities::CommitDetail, stats: params[:stats], current_user: current_user
      end

      desc 'Get the diff for a specific commit of a project' do
        failure [[404, 'Commit Not Found']]
      end
      params do
        requires :sha, type: String, desc: 'A commit sha, or the name of a branch or tag'
        use :pagination
      end
      get ':id/repository/commits/:sha/diff', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS, urgency: :low do
        commit = user_project.commit(params[:sha])

        not_found! 'Commit' unless commit

        raw_diffs = ::Kaminari.paginate_array(commit.diffs(expanded: true).diffs.to_a)

        present paginate(raw_diffs), with: Entities::Diff
      end

      desc "Get a commit's comments" do
        success Entities::CommitNote
        failure [[404, 'Commit Not Found']]
      end
      params do
        use :pagination
        requires :sha, type: String, desc: 'A commit sha, or the name of a branch or tag'
      end
      get ':id/repository/commits/:sha/comments', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS do
        commit = user_project.commit(params[:sha])

        not_found! 'Commit' unless commit
        notes = commit.notes.with_api_entity_associations.fresh

        present paginate(notes), with: Entities::CommitNote
      end

      desc 'Cherry pick commit into a branch' do
        detail 'This feature was introduced in GitLab 8.15'
        success Entities::Commit
      end
      params do
        requires :sha, type: String, desc: 'A commit sha, or the name of a branch or tag to be cherry picked'
        requires :branch, type: String, desc: 'The name of the branch', allow_blank: false
        optional :dry_run, type: Boolean, default: false, desc: "Does not commit any changes"
        optional :message, type: String, desc: 'A custom commit message to use for the picked commit'
      end
      post ':id/repository/commits/:sha/cherry_pick', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS do
        authorize_push_to_branch!(params[:branch])

        commit = user_project.commit(params[:sha])
        not_found!('Commit') unless commit

        find_branch!(params[:branch])

        commit_params = {
          commit: commit,
          start_branch: params[:branch],
          branch_name: params[:branch],
          dry_run: params[:dry_run],
          message: params[:message]
        }

        result = ::Commits::CherryPickService
          .new(user_project, current_user, commit_params)
          .execute

        if result[:status] == :success
          if params[:dry_run]
            present dry_run: :success
            status :ok
          else
            present user_project.repository.commit(result[:result]),
              with: Entities::Commit
          end
        else
          response = result.slice(:message, :error_code)
          response[:dry_run] = :error if params[:dry_run]

          error!(response, 400, header)
        end
      end

      desc 'Revert a commit in a branch' do
        detail 'This feature was introduced in GitLab 11.5'
        success Entities::Commit
      end
      params do
        requires :sha, type: String, desc: 'Commit SHA to revert'
        requires :branch, type: String, desc: 'Target branch name', allow_blank: false
        optional :dry_run, type: Boolean, default: false, desc: "Does not commit any changes"
      end
      post ':id/repository/commits/:sha/revert', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS do
        authorize_push_to_branch!(params[:branch])

        commit = user_project.commit(params[:sha])
        not_found!('Commit') unless commit

        find_branch!(params[:branch])

        commit_params = {
          commit: commit,
          start_branch: params[:branch],
          branch_name: params[:branch],
          dry_run: params[:dry_run]
        }

        result = ::Commits::RevertService
          .new(user_project, current_user, commit_params)
          .execute

        if result[:status] == :success
          if params[:dry_run]
            present dry_run: :success
            status :ok
          else
            present user_project.repository.commit(result[:result]),
              with: Entities::Commit
          end
        else
          response = result.slice(:message, :error_code)
          response[:dry_run] = :error if params[:dry_run]

          error!(response, 400, header)
        end
      end

      desc 'Get all references a commit is pushed to' do
        detail 'This feature was introduced in GitLab 10.6'
        success Entities::BasicRef
      end
      params do
        requires :sha, type: String, desc: 'A commit sha'
        optional :type, type: String, values: %w[branch tag all], default: 'all', desc: 'Scope'
        use :pagination
      end
      get ':id/repository/commits/:sha/refs', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS, urgency: :low do
        commit = user_project.commit(params[:sha])
        not_found!('Commit') unless commit

        refs = []
        refs.concat(user_project.repository.branch_names_contains(commit.id).map {|name| { type: 'branch', name: name }}) unless params[:type] == 'tag'
        refs.concat(user_project.repository.tag_names_contains(commit.id).map {|name| { type: 'tag', name: name }}) unless params[:type] == 'branch'
        refs = Kaminari.paginate_array(refs)

        present paginate(refs), with: Entities::BasicRef
      end

      desc 'Post comment to commit' do
        success Entities::CommitNote
      end
      params do
        requires :sha, type: String, desc: 'A commit sha, or the name of a branch or tag on which to post a comment'
        requires :note, type: String, desc: 'The text of the comment'
        optional :path, type: String, desc: 'The file path'
        given :path do
          requires :line, type: Integer, desc: 'The line number'
          requires :line_type, type: String, values: %w[new old], default: 'new', desc: 'The type of the line'
        end
      end
      post ':id/repository/commits/:sha/comments', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS do
        commit = user_project.commit(params[:sha])
        not_found! 'Commit' unless commit

        opts = {
          note: params[:note],
          noteable_type: 'Commit',
          commit_id: commit.id
        }

        if params[:path]
          commit.raw_diffs(limits: false).each do |diff|
            next unless diff.new_path == params[:path]

            lines = Gitlab::Diff::Parser.new.parse(diff.diff.each_line)

            lines.each do |line|
              next unless line.line == params[:line] && line.type == params[:line_type]

              break opts[:line_code] = Gitlab::Git.diff_line_code(diff.new_path, line.new_pos, line.old_pos)
            end

            break if opts[:line_code]
          end

          opts[:type] = LegacyDiffNote.name if opts[:line_code]
        end

        note = ::Notes::CreateService.new(user_project, current_user, opts).execute

        if note.save
          present note, with: Entities::CommitNote
        else
          render_api_error!("Failed to save note #{note.errors.messages}", 400)
        end
      end

      desc 'Get Merge Requests associated with a commit' do
        success Entities::MergeRequestBasic
      end
      params do
        requires :sha, type: String, desc: 'A commit sha, or the name of a branch or tag on which to find Merge Requests'
        use :pagination
      end
      get ':id/repository/commits/:sha/merge_requests', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS, urgency: :low do
        authorize! :read_merge_request, user_project

        commit = user_project.commit(params[:sha])
        not_found! 'Commit' unless commit

        commit_merge_requests = MergeRequestsFinder.new(
          current_user,
          project_id: user_project.id,
          commit_sha: commit.sha
        ).execute.with_api_entity_associations

        present paginate(commit_merge_requests), with: Entities::MergeRequestBasic
      end

      desc "Get a commit's signature" do
        success Entities::CommitSignature
      end
      params do
        requires :sha, type: String, desc: 'A commit sha, or the name of a branch or tag'
      end
      get ':id/repository/commits/:sha/signature', requirements: API::COMMIT_ENDPOINT_REQUIREMENTS do
        commit = user_project.commit(params[:sha])
        not_found! 'Commit' unless commit
        not_found! 'Signature' unless commit.has_signature?

        present commit, with: Entities::CommitSignature
      end
    end
  end
end
