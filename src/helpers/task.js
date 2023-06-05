
const submitTask = (ctx) => {
  const { args, client, workflow } = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc)
  .tasks
  .create({attributes: JSON.stringify({
     type: 'support'
  }), workflowSid: workflow.sid
  })
  .then(task => console.log(task.sid));
};

module.exports = {
  submitTask
}