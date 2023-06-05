const R = require('ramda');
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers');

const parseAndValidateArgs = (options) => {
  const { aliases, required } = options;
  const aliasPairs = R.toPairs(aliases);
  const optsStr = aliasPairs.map(aliasToOptionStr).join(' ');
  const argv = yargs(hideBin(process.argv))
    .usage(`'Usage: $0 ${optsStr}'`)
    .alias(aliases)
    .default('o', 'info')
    .demandOption(required)
    .argv;
  return argv;  
}

const aliasToOptionStr = ([key, alias]) => `-${key} [${alias}]`;

module.exports = {
  parseAndValidateArgs
}
