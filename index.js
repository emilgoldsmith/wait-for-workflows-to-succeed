const core = require("@actions/core");
const github = require("@actions/github");

try {
  const waitInterval = parseInt(
    core.getInput("wait-interval", { required: true })
  );
  const waitMax = parseInt(core.getInput("wait-max", { required: true }));
  const token = core.getInput("repo-token", { required: true });
  const workflows = core
    .getInput("workflows", { required: true })
    .split("\n")
    .map((x) => x.trim());

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const checkIfWorkflowDone = async function (workflowName) {
    let conclusion;
    try {
      const { data } = await octokit.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: workflowName,
        event: github.context.eventName,
        branch: github.context.ref.split('refs/heads/')[1],
        per_page: 1,
      });
      data = response.data;
      if (data.workflow_runs.length < 1) return false;
      const mostRecent = data.workflow_runs[0];
      console.log(JSON.stringify(context.event, null, 4));
      if (mostRecent.status !== 'completed') return false;
      conclusion = mostRecent.conclusion;
    } catch (e) {
      return false;
    }
    if (conclusion !== 'success') throw new Error(`Workflow ${workflowName} failed`);
    return true;
  };

  const sleep = async function (seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  };

  (async () => {
    try {
      let executedTime = 0;
      let done = false;
      while (!done) {
        for (workflow of workflows) {
          done = await checkIfWorkflowDone(workflow);
          if (done == false) break;
        }
        if (done) break;
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
