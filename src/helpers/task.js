
const submitTask = (ctx) => {
  const {args, client} = ctx;
  client.taskrouter.v1.workspaces(args.wrkspc)
  .tasks
  .create({attributes: JSON.stringify({
     type: 'support'
   }), workflowSid: args.wrkflo})
  .then(task => console.log(task.sid));
};

module.exports = {
  submitTask
}