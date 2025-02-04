# frozen_string_literal: true

module Gitlab
  module ProcessManagement
    # The signals that should terminate both the master and workers.
    TERMINATE_SIGNALS = %i(INT TERM).freeze

    # The signals that should simply be forwarded to the workers.
    FORWARD_SIGNALS = %i(TTIN USR1 USR2 HUP).freeze

    # Traps the given signals and yields the block whenever these signals are
    # received.
    #
    # The block is passed the name of the signal.
    #
    # Example:
    #
    #     trap_signals(%i(HUP TERM)) do |signal|
    #       ...
    #     end
    def self.trap_signals(signals)
      signals.each do |signal|
        trap(signal) do
          yield signal
        end
      end
    end

    def self.trap_terminate(&block)
      trap_signals(TERMINATE_SIGNALS, &block)
    end

    def self.trap_forward(&block)
      trap_signals(FORWARD_SIGNALS, &block)
    end

    def self.signal(pid, signal)
      Process.kill(signal, pid)
      true
    rescue Errno::ESRCH
      false
    end

    def self.signal_processes(pids, signal)
      pids.each { |pid| signal(pid, signal) }
    end

    # Waits for the given process to complete using a separate thread.
    def self.wait_async(pid)
      Thread.new do
        Process.wait(pid) rescue Errno::ECHILD
      end
    end

    # Returns true if all the processes are alive.
    def self.all_alive?(pids)
      pids.each do |pid|
        return false unless process_alive?(pid)
      end

      true
    end

    def self.any_alive?(pids)
      pids_alive(pids).any?
    end

    def self.pids_alive(pids)
      pids.select { |pid| process_alive?(pid) }
    end

    def self.process_alive?(pid)
      # Signal 0 tests whether the process exists and we have access to send signals
      # but is otherwise a noop (doesn't actually send a signal to the process)
      signal(pid, 0)
    end

    def self.write_pid(path)
      File.open(path, 'w') do |handle|
        handle.write(Process.pid.to_s)
      end
    end
  end
end
