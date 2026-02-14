import { defineSignal, proxyActivities, setHandler, sleep, condition } from "@temporalio/workflow";

type WorkflowActivities = {
  markJobRunning(jobId: string): Promise<void>;
  runPythonTask(jobId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  markJobCompleted(jobId: string, output: Record<string, unknown>): Promise<void>;
  compensateJob(jobId: string, reason: string): Promise<void>;
  notifyApprovalTimeout(requestId: string): Promise<void>;
  markApprovalResult(requestId: string, approved: boolean): Promise<void>;
  retryJob(jobId: string): Promise<void>;
  recordRemediation(jobId: string, action: string): Promise<void>;
};

const activities = proxyActivities<WorkflowActivities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    maximumAttempts: 3
  }
});

export async function JobLifecycleWorkflow(jobId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  await activities.markJobRunning(jobId);

  try {
    const output = await activities.runPythonTask(jobId, payload);
    await activities.markJobCompleted(jobId, output);
    return output;
  } catch (error) {
    await activities.compensateJob(jobId, (error as Error).message);
    throw error;
  }
}

const approvalSignal = defineSignal<[boolean]>("approvalSignal");

export async function ApprovalWorkflow(requestId: string): Promise<{ approved: boolean; requestId: string }> {
  let approved = false;
  let decided = false;

  setHandler(approvalSignal, (value) => {
    approved = value;
    decided = true;
  });

  const decisionReached = await condition(() => decided, "10 minutes");
  if (!decisionReached) {
    await activities.notifyApprovalTimeout(requestId);
    await activities.markApprovalResult(requestId, false);
    return { approved: false, requestId };
  }

  await sleep("1 second");
  await activities.markApprovalResult(requestId, approved);
  return { approved, requestId };
}

export async function RemediationWorkflow(jobId: string): Promise<{ jobId: string; action: string }> {
  await activities.retryJob(jobId);
  await activities.recordRemediation(jobId, "retry-job");
  return { jobId, action: "retry-job" };
}
