const core = require("@actions/core");
const github = require("@actions/github");
const DEBUG_OFF = 0;
const DEBUG_ON = 1
const DEBUG_VERBOSE = 2

try {
  const waitInterval = parseInt(
    core.getInput("wait-interval-seconds", { required: true })
  );
  const waitMax = parseInt(core.getInput("wait-max-seconds", { required: true }));
  const token = core.getInput("repo-token", { required: true });
  let workflows = core
    .getInput("workflows", { required: true })
    .split("\n")
    .map((x) => x.trim());
  const debugString = core.getInput("debug", { required: false });
  let debug;
  switch (debugString.toLowerCase()) {
    case "on":
      debug = DEBUG_ON;
      break;
    case "verbose":
      debug = DEBUG_VERBOSE;
      break;
    default:
      debug = DEBUG_OFF;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  if (debug >= DEBUG_ON) core.info(`owner: ${owner}\nrepo: ${repo}`);

  const checkIfWorkflowDone = async function (workflowName, created_at) {
    let conclusion, waiting_created_at;
    try {
      const options = {
        owner,
        repo,
        workflow_id: workflowName,
        event: github.context.eventName,
        branch: github.context.ref.split('refs/heads/')[1],
        per_page: 5,
      }
      if (debug >= DEBUG_ON) core.info("Trying to match on same event name as current event");
      let theMatch = await getMatch(options, created_at);
      if (theMatch === undefined) {
        if (options.event === 'pull_request') {
          if (debug >= DEBUG_ON) core.info("Trying to match on pull_request_target event for pull_request event");
          theMatch = await getMatch({ ...options, event: 'pull_request_target' }, created_at)
        }
        else if (options.event === 'pull_request_target') {
          if (debug >= DEBUG_ON) core.info("Trying to match on pull_request event for pull_request_target event");
          theMatch = await getMatch({ ...options, event: 'pull_request' }, created_at)
        }
      }
      if (theMatch === undefined) {
        if (debug >= DEBUG_ON) core.info("No matching methods found anything");
        return false;
      }
      if (debug >= DEBUG_ON) core.info(`chosen candidate status: ${theMatch.status}`);
      if (theMatch.status !== 'completed') {
        if (debug >= DEBUG_ON) core.info(`Not Yet Completed`);
        return false;
      }
      conclusion = theMatch.conclusion;
      waiting_created_at = theMatch.created_at;
    } catch (e) {
      if (e.message === "Not Found") {
        if (debug >= DEBUG_ON) core.info("Error caught:\n" + e.toString());
        return false;
      }
      throw e;
    }
    if (conclusion !== 'success') throw new Error(`Workflow ${workflowName} failed`);
    return true;
  };
  async function getMatch(options, created_at) {
    if (debug >= DEBUG_ON) core.info("The request options for listWorkflowRuns are: " + JSON.stringify(options));
    const { data } = await octokit.actions.listWorkflowRuns(options);
    if (debug >= DEBUG_VERBOSE) core.info(`all matched candidate information: ${JSON.stringify(data, null, 4)}`)
    const mainSha = github.context.eventName === 'pull_request' ? github.context.payload.pull_request.head.sha : github.context.sha;
    if (debug >= DEBUG_ON) core.info(`expectedSha: ${mainSha}`);
    if (debug >= DEBUG_ON) core.info(`candidateShas: ${JSON.stringify(data.workflow_runs.map(x => x.head_sha))}`);
    if (debug >= DEBUG_VERBOSE) core.info(`all candidate information: ${JSON.stringify(data, null, 4)}`)
    const filteredForSha = data.workflow_runs.filter(x => x.head_sha === mainSha)
    if (filteredForSha.length < 1) {
      if (debug >= DEBUG_ON) core.info(`No Candidates Matched on SHA`);
      return undefined;
    }

    if (debug >= DEBUG_ON) core.info(`this workflow is created_at: ${created_at}`);
    if (debug >= DEBUG_ON) core.info(`created_ats of candidates: ${JSON.stringify(data.workflow_runs.map(x => x.created_at))}`);
    const theMatch = filteredForSha.find(x => {
      if (options.event === github.context.eventName) {
        if (debug >= DEBUG_ON) core.info('Doing exact comparison');
        return x.created_at === created_at;
      } else {
        // For different events created_ats can differ a bit so give some leeway
        if (debug >= DEBUG_ON) core.info('Doing within 3 seconds comparison');
        return Math.abs(new Date(x.created_at).getTime() - new Date(created_at).getTime()) < 3000;
      }
    });
    if (!theMatch) {
      if (debug >= DEBUG_ON) core.info(`No SHA matches matched the created_at`)
      return undefined;
    }
    return theMatch;
  }

  const sleep = async function (seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  };

  (async () => {
    try {
      const { data: { created_at } } = await octokit.actions.getWorkflowRun({
        owner, repo, run_id: github.context.runId
      });

      let executedTime = 0;
      let workflowsStillNotDone = [...workflows];
      while (workflowsStillNotDone.length > 0) {
        workflows = [...workflowsStillNotDone];
        for (workflowName of workflows) {
          core.info(`Checking ${workflowName}`)
          const done = await checkIfWorkflowDone(workflowName, created_at);
          if (done == false) {
            core.info(`${workflowName} not done yet`);
            break;
          }
          core.info(`Workflow ${workflowName} is done after ${executedTime} seconds`);
          // It is done so we don't need to keep checking it
          workflowsStillNotDone = workflowsStillNotDone.filter(x => x !== workflowName);
        }
        if (workflowsStillNotDone.length === 0) break;
        await sleep(waitInterval);
        executedTime += waitInterval;
        if (executedTime > waitMax) {
          core.setFailed("Time exceeded the maximum " + waitMax + " seconds");
          break;
        }
      }
    } catch (error) {
      core.setFailed(error.message);
    }
  })();
} catch (error) {
  core.setFailed(error.message);
}
