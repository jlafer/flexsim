require("dotenv").config();
const R = require('ramda');
const { readJsonFile, writeToJsonFile } = require('flexsim-lib');
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");

const { parseAndValidateArgs } = require('./helpers/args');

async function run() {
  const args = getArgs();
  const { locale, cfgdir } = args;
  const speech = await readSpeechData(args, locale);
  const timingData = await genAudioTiming(speech);
  await writeToJsonFile(`${cfgdir}/speechData.json`, timingData);
}

run();

async function genAudioTiming(speech) {
  const { agent, ivr } = speech;
  const ivrTiming = await getPartyTiming(ivr);
  const agtTiming = await getPartyTiming(agent);
  const data = { ivr: ivrTiming, agent: agtTiming };
  return data;
}

async function getPartyTiming(textList) {
  const data = [];
  for (let i = 0; i < textList.length; i++) {
    const text = textList[i];
    const duration = await getTimingForResponse(text);
    data.push(`${duration}-${text}`);
  }
  return data;
}

async function getTimingForResponse(speech) {
  const client = new PollyClient();
  const input = {
    Engine: "standard",
    LanguageCode: "en-US",
    OutputFormat: "json",
    SpeechMarkTypes: ["viseme"],
    Text: speech,
    TextType: "text",
    VoiceId: "Joanna",
  };
  const command = new SynthesizeSpeechCommand(input);
  const response = await client.send(command);
  //console.log('speech response:', response);
  const lines = await response.AudioStream.transformToString();
  //console.log('speech lines:', lines);
  const linesArr = lines.split('\n');
  //console.log('linesArr:', linesArr);
  // get next to last line; it should contain the 'sil' record
  const json = linesArr[linesArr.length - 2];
  console.log('json:', json);
  const speechData = JSON.parse(json);
  console.log('speechData:', speechData);
  const duration = Math.round(speechData.time / 1000);
  console.log('duration:', duration);
  return duration;
}

async function readSpeechData(args) {
  const { domaindir, locale } = args;
  let speech;
  if (!!domaindir)
    speech = await readJsonFile(`${domaindir}/speech.json`);
  else
    speech = await readJsonFile(`localization/${locale}-speech.json`);
  return speech;
}

function getArgs() {
  const args = parseAndValidateArgs({
    aliases: { d: 'domaindir', c: 'cfgdir', l: 'locale' },
    required: []
  });
  args.locale = args.locale || 'en-us';
  const { domaindir, cfgdir, locale } = args;
  console.log('domaindir:', domaindir);
  console.log('cfgdir:', cfgdir);
  console.log('locale:', locale);
  return args;
}
