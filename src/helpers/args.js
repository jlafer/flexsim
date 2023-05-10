const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers');

const parseAndValidateArgs = () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 -a [acct] -A [auth] -W [wrkspc] -w [wrkflo]')
    .alias('a', 'acct')
    .alias('A', 'auth')
    .alias('W', 'wrkspc')
    .alias('w', 'wrkflo')
    .demandOption(['a', 'A', 'w', 'W'])
    .argv;

  return argv;  
}

module.exports = {
  parseAndValidateArgs
}