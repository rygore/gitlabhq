import { GlLink, GlLabel, GlIcon, GlFormCheckbox, GlSprintf } from '@gitlab/ui';
import { useFakeDate } from 'helpers/fake_date';
import { shallowMountExtended as shallowMount } from 'helpers/vue_test_utils_helper';
import IssuableItem from '~/issuable_list/components/issuable_item.vue';
import IssuableAssignees from '~/vue_shared/components/issue/issue_assignees.vue';

import { mockIssuable, mockRegularLabel, mockScopedLabel } from '../mock_data';

const createComponent = ({
  issuableSymbol = '#',
  issuable = mockIssuable,
  enableLabelPermalinks = true,
  showCheckbox = true,
  slots = {},
} = {}) =>
  shallowMount(IssuableItem, {
    propsData: {
      issuableSymbol,
      issuable,
      enableLabelPermalinks,
      showDiscussions: true,
      showCheckbox,
    },
    slots,
    stubs: {
      GlSprintf,
    },
  });

const MOCK_GITLAB_URL = 'http://0.0.0.0:3000';

describe('IssuableItem', () => {
  // The mock data is dependent that this is after our default date
  useFakeDate(2020, 11, 11);

  const mockLabels = mockIssuable.labels.nodes;
  const mockAuthor = mockIssuable.author;
  const originalUrl = gon.gitlab_url;
  let wrapper;

  beforeEach(() => {
    gon.gitlab_url = MOCK_GITLAB_URL;
  });

  afterEach(() => {
    wrapper.destroy();
    gon.gitlab_url = originalUrl;
  });

  describe('computed', () => {
    describe('author', () => {
      it('returns `issuable.author` reference', () => {
        wrapper = createComponent();

        expect(wrapper.vm.author).toEqual(mockIssuable.author);
      });
    });

    describe('authorId', () => {
      it.each`
        authorId                 | returnValue
        ${1}                     | ${1}
        ${'1'}                   | ${1}
        ${'gid://gitlab/User/1'} | ${1}
        ${'foo'}                 | ${null}
      `(
        'returns $returnValue when value of `issuable.author.id` is $authorId',
        async ({ authorId, returnValue }) => {
          wrapper = createComponent({
            issuable: {
              ...mockIssuable,
              author: {
                ...mockAuthor,
                id: authorId,
              },
            },
          });

          await wrapper.vm.$nextTick();

          expect(wrapper.vm.authorId).toBe(returnValue);
        },
      );
    });

    describe('isIssuableUrlExternal', () => {
      it.each`
        issuableWebUrl                                            | urlType                    | returnValue
        ${'/gitlab-org/gitlab-test/-/issues/2'}                   | ${'relative'}              | ${false}
        ${`${MOCK_GITLAB_URL}/gitlab-org/gitlab-test/-/issues/1`} | ${'absolute and internal'} | ${false}
        ${'http://jira.atlassian.net/browse/IG-1'}                | ${'external'}              | ${true}
        ${'https://github.com/gitlabhq/gitlabhq/issues/1'}        | ${'external'}              | ${true}
      `(
        'returns $returnValue when `issuable.webUrl` is $urlType',
        async ({ issuableWebUrl, returnValue }) => {
          wrapper = createComponent({
            issuable: {
              ...mockIssuable,
              webUrl: issuableWebUrl,
            },
          });

          await wrapper.vm.$nextTick();

          expect(wrapper.vm.isIssuableUrlExternal).toBe(returnValue);
        },
      );
    });

    describe('labels', () => {
      it('returns `issuable.labels.nodes` reference when it is available', () => {
        wrapper = createComponent();

        expect(wrapper.vm.labels).toEqual(mockLabels);
      });

      it('returns `issuable.labels` reference when it is available', async () => {
        wrapper = createComponent({
          issuable: {
            ...mockIssuable,
            labels: mockLabels,
          },
        });

        await wrapper.vm.$nextTick();

        expect(wrapper.vm.labels).toEqual(mockLabels);
      });

      it('returns empty array when none of `issuable.labels.nodes` or `issuable.labels` are available', async () => {
        wrapper = createComponent({
          issuable: {
            ...mockIssuable,
            labels: null,
          },
        });

        await wrapper.vm.$nextTick();

        expect(wrapper.vm.labels).toEqual([]);
      });
    });

    describe('assignees', () => {
      it('returns `issuable.assignees` reference when it is available', () => {
        wrapper = createComponent();

        expect(wrapper.vm.assignees).toBe(mockIssuable.assignees);
      });
    });

    describe('updatedAt', () => {
      it('returns string containing timeago string based on `issuable.updatedAt`', () => {
        wrapper = createComponent();

        expect(wrapper.vm.updatedAt).toContain('updated');
        expect(wrapper.vm.updatedAt).toContain('ago');
      });
    });

    describe('showDiscussions', () => {
      it.each`
        userDiscussionsCount | returnValue
        ${0}                 | ${true}
        ${1}                 | ${true}
        ${undefined}         | ${false}
        ${null}              | ${false}
      `(
        'returns $returnValue when issuable.userDiscussionsCount is $userDiscussionsCount',
        ({ userDiscussionsCount, returnValue }) => {
          wrapper = createComponent({
            issuableSymbol: '#',
            issuable: {
              ...mockIssuable,
              userDiscussionsCount,
            },
          });

          expect(wrapper.findByTestId('issuable-discussions').exists()).toBe(returnValue);
        },
      );
    });
  });

  describe('methods', () => {
    describe('scopedLabel', () => {
      it.each`
        label               | labelType    | returnValue
        ${mockRegularLabel} | ${'regular'} | ${false}
        ${mockScopedLabel}  | ${'scoped'}  | ${true}
      `(
        'return $returnValue when provided label param is a $labelType label',
        ({ label, returnValue }) => {
          wrapper = createComponent();

          expect(wrapper.vm.scopedLabel(label)).toBe(returnValue);
        },
      );
    });

    describe('labelTitle', () => {
      it.each`
        label               | propWithTitle | returnValue
        ${{ title: 'foo' }} | ${'title'}    | ${'foo'}
        ${{ name: 'foo' }}  | ${'name'}     | ${'foo'}
      `('returns string value of `label.$propWithTitle`', ({ label, returnValue }) => {
        wrapper = createComponent();

        expect(wrapper.vm.labelTitle(label)).toBe(returnValue);
      });
    });

    describe('labelTarget', () => {
      it('returns target string for a provided label param when `enableLabelPermalinks` is true', () => {
        wrapper = createComponent();

        expect(wrapper.vm.labelTarget(mockRegularLabel)).toBe(
          '?label_name[]=Documentation%20Update',
        );
      });

      it('returns string "#" for a provided label param when `enableLabelPermalinks` is false', async () => {
        wrapper = createComponent({
          enableLabelPermalinks: false,
        });

        await wrapper.vm.$nextTick();

        expect(wrapper.vm.labelTarget(mockRegularLabel)).toBe('#');
      });
    });
  });

  describe('template', () => {
    it.each`
      gitlabWebUrl           | webUrl                        | expectedHref                  | expectedTarget
      ${undefined}           | ${`${MOCK_GITLAB_URL}/issue`} | ${`${MOCK_GITLAB_URL}/issue`} | ${undefined}
      ${undefined}           | ${'https://jira.com/issue'}   | ${'https://jira.com/issue'}   | ${'_blank'}
      ${'/gitlab-org/issue'} | ${'https://jira.com/issue'}   | ${'/gitlab-org/issue'}        | ${undefined}
    `(
      'renders issuable title correctly when `gitlabWebUrl` is `$gitlabWebUrl` and webUrl is `$webUrl`',
      async ({ webUrl, gitlabWebUrl, expectedHref, expectedTarget }) => {
        wrapper = createComponent({
          issuable: {
            ...mockIssuable,
            webUrl,
            gitlabWebUrl,
          },
        });

        await wrapper.vm.$nextTick();

        const titleEl = wrapper.find('[data-testid="issuable-title"]');

        expect(titleEl.exists()).toBe(true);
        expect(titleEl.find(GlLink).attributes('href')).toBe(expectedHref);
        expect(titleEl.find(GlLink).attributes('target')).toBe(expectedTarget);
        expect(titleEl.find(GlLink).text()).toBe(mockIssuable.title);
      },
    );

    it('renders checkbox when `showCheckbox` prop is true', async () => {
      wrapper = createComponent({
        showCheckbox: true,
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find(GlFormCheckbox).exists()).toBe(true);
      expect(wrapper.find(GlFormCheckbox).attributes('checked')).not.toBeDefined();

      wrapper.setProps({
        checked: true,
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find(GlFormCheckbox).attributes('checked')).toBe('true');
    });

    it('renders issuable title with `target` set as "_blank" when issuable.webUrl is external', async () => {
      wrapper = createComponent({
        issuable: {
          ...mockIssuable,
          webUrl: 'http://jira.atlassian.net/browse/IG-1',
        },
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="issuable-title"]').find(GlLink).attributes('target')).toBe(
        '_blank',
      );
    });

    it('renders issuable confidential icon when issuable is confidential', async () => {
      wrapper = createComponent({
        issuable: {
          ...mockIssuable,
          confidential: true,
        },
      });

      await wrapper.vm.$nextTick();

      const confidentialEl = wrapper.find('[data-testid="issuable-title"]').find(GlIcon);

      expect(confidentialEl.exists()).toBe(true);
      expect(confidentialEl.props('name')).toBe('eye-slash');
      expect(confidentialEl.attributes()).toMatchObject({
        title: 'Confidential',
        arialabel: 'Confidential',
      });
    });

    it('renders spam icon when issuable is hidden', async () => {
      wrapper = createComponent({ issuable: { ...mockIssuable, hidden: true } });

      const hiddenIcon = wrapper.findComponent(GlIcon);

      expect(hiddenIcon.props('name')).toBe('spam');
      expect(hiddenIcon.attributes()).toMatchObject({
        title: 'This issue is hidden because its author has been banned',
        arialabel: 'Hidden',
      });
    });

    it('renders task status', () => {
      wrapper = createComponent();

      const taskStatus = wrapper.find('[data-testid="task-status"]');
      const expected = `${mockIssuable.taskCompletionStatus.completedCount} of ${mockIssuable.taskCompletionStatus.count} tasks completed`;

      expect(taskStatus.text()).toBe(expected);
    });

    it('renders issuable reference', () => {
      wrapper = createComponent();

      const referenceEl = wrapper.find('[data-testid="issuable-reference"]');

      expect(referenceEl.exists()).toBe(true);
      expect(referenceEl.text()).toBe(`#${mockIssuable.iid}`);
    });

    it('renders issuable reference via slot', () => {
      wrapper = createComponent({
        issuableSymbol: '#',
        issuable: mockIssuable,
        slots: {
          reference: `
            <b class="js-reference">${mockIssuable.iid}</b>
          `,
        },
      });
      const referenceEl = wrapper.find('.js-reference');

      expect(referenceEl.exists()).toBe(true);
      expect(referenceEl.text()).toBe(`${mockIssuable.iid}`);
    });

    it('renders issuable createdAt info', () => {
      wrapper = createComponent();

      const createdAtEl = wrapper.find('[data-testid="issuable-created-at"]');

      expect(createdAtEl.exists()).toBe(true);
      expect(createdAtEl.attributes('title')).toBe('Jun 29, 2020 1:52pm UTC');
      expect(createdAtEl.text()).toBe(wrapper.vm.createdAt);
    });

    it('renders issuable author info', () => {
      wrapper = createComponent();

      const authorEl = wrapper.find('[data-testid="issuable-author"]');

      expect(authorEl.exists()).toBe(true);
      expect(authorEl.attributes()).toMatchObject({
        'data-user-id': `${wrapper.vm.authorId}`,
        'data-username': mockAuthor.username,
        'data-name': mockAuthor.name,
        'data-avatar-url': mockAuthor.avatarUrl,
        href: mockAuthor.webUrl,
      });
      expect(authorEl.text()).toBe(mockAuthor.name);
    });

    it('renders issuable author info via slot', () => {
      wrapper = createComponent({
        issuableSymbol: '#',
        issuable: mockIssuable,
        slots: {
          reference: `
            <span class="js-author">${mockAuthor.name}</span>
          `,
        },
      });
      const authorEl = wrapper.find('.js-author');

      expect(authorEl.exists()).toBe(true);
      expect(authorEl.text()).toBe(mockAuthor.name);
    });

    it('renders timeframe via slot', () => {
      wrapper = createComponent({
        issuableSymbol: '#',
        issuable: mockIssuable,
        slots: {
          timeframe: `
            <b class="js-timeframe">Jan 1, 2020 - Mar 31, 2020</b>
          `,
        },
      });
      const timeframeEl = wrapper.find('.js-timeframe');

      expect(timeframeEl.exists()).toBe(true);
      expect(timeframeEl.text()).toBe('Jan 1, 2020 - Mar 31, 2020');
    });

    it('renders gl-label component for each label present within `issuable` prop', () => {
      wrapper = createComponent();

      const labelsEl = wrapper.findAll(GlLabel);

      expect(labelsEl.exists()).toBe(true);
      expect(labelsEl).toHaveLength(mockLabels.length);
      expect(labelsEl.at(0).props()).toMatchObject({
        backgroundColor: mockLabels[0].color,
        title: mockLabels[0].title,
        description: mockLabels[0].description,
        scoped: false,
        target: wrapper.vm.labelTarget(mockLabels[0]),
        size: 'sm',
      });
    });

    it('renders issuable status via slot', () => {
      wrapper = createComponent({
        issuableSymbol: '#',
        issuable: mockIssuable,
        slots: {
          status: `
            <b class="js-status">${mockIssuable.state}</b>
          `,
        },
      });
      const statusEl = wrapper.find('.js-status');

      expect(statusEl.exists()).toBe(true);
      expect(statusEl.text()).toBe(`${mockIssuable.state}`);
    });

    it('renders discussions count', () => {
      wrapper = createComponent();

      const discussionsEl = wrapper.find('[data-testid="issuable-discussions"]');

      expect(discussionsEl.exists()).toBe(true);
      expect(discussionsEl.find(GlLink).attributes()).toMatchObject({
        title: 'Comments',
        href: `${mockIssuable.webUrl}#notes`,
      });
      expect(discussionsEl.find(GlIcon).props('name')).toBe('comments');
      expect(discussionsEl.find(GlLink).text()).toContain('2');
    });

    it('renders issuable-assignees component', () => {
      wrapper = createComponent();

      const assigneesEl = wrapper.find(IssuableAssignees);

      expect(assigneesEl.exists()).toBe(true);
      expect(assigneesEl.props()).toMatchObject({
        assignees: mockIssuable.assignees,
        iconSize: 16,
        maxVisible: 4,
      });
    });

    it('renders issuable updatedAt info', () => {
      wrapper = createComponent();

      const updatedAtEl = wrapper.find('[data-testid="issuable-updated-at"]');

      expect(updatedAtEl.attributes('title')).toBe('Sep 10, 2020 11:41am UTC');
      expect(updatedAtEl.text()).toBe(wrapper.vm.updatedAt);
    });

    describe('when issuable is closed', () => {
      it('renders issuable card with a closed style', () => {
        wrapper = createComponent({ issuable: { ...mockIssuable, closedAt: '2020-12-10' } });

        expect(wrapper.classes()).toContain('closed');
      });
    });

    describe('when issuable was created within the past 24 hours', () => {
      it('renders issuable card with a recently-created style', () => {
        wrapper = createComponent({
          issuable: { ...mockIssuable, createdAt: '2020-12-10T12:34:56' },
        });

        expect(wrapper.classes()).toContain('today');
      });
    });

    describe('when issuable was created earlier than the past 24 hours', () => {
      it('renders issuable card without a recently-created style', () => {
        wrapper = createComponent({ issuable: { ...mockIssuable, createdAt: '2020-12-09' } });

        expect(wrapper.classes()).not.toContain('today');
      });
    });
  });
});
