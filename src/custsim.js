const {parseAndValidateArgs} = require('./helpers/args');
const { initializeContext } = require('./helpers/context');
const {submitTask} = require('./helpers/task');

const args = parseAndValidateArgs();
const {acct, auth} = args;
console.log('acct:', acct);
console.log('auth:', auth);
//const cfg = readConfiguration(args);
const cfg = {};
const ctx = initializeContext(cfg, args);
//loop
//	delay(cfg.load.rate)
const task = submitTask(ctx)
//	report = addTaskToReport(task)
//until done
//reportWorkload(report)
