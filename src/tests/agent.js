require("dotenv").config();
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const { ACCOUNT_SID, AUTH_TOKEN, WRKSPC_SID } = process.env;
const client = require('twilio')(ACCOUNT_SID, AUTH_TOKEN);

const from = '+15072747105';
const to = '+18148134754';

async function init() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.post('/reservation', (req, res) => {
    const { TaskSid, TaskAttributes, ReservationSid } = req.body;
    const taskAttributes = JSON.parse(TaskAttributes);
    console.log(`received reservation ${ReservationSid} for task ${TaskSid}`);
    console.log('with attributes:', taskAttributes);
    client.taskrouter.v1.workspaces(WRKSPC_SID)
      .tasks(TaskSid)
      .reservations(ReservationSid)
      .update({
        instruction: 'conference',
        from: from,
        to: to,
        endConferenceOnExit: true
      });
    res.status(200).send({});
  });

  app.post('/agentJoined', (req, res) => {
    console.log('agent:agentJoined: the agent has joined the conference');
    const twiml = new VoiceResponse();
    twiml.say('Hi.');
    twiml.pause({
      length: 5
    });
    twiml.say('I am the agent. How can I help?');
    twiml.pause({
      length: 5
    });
    twiml.say('I just paused for another five seconds.');
    twiml.pause({
      length: 30
    });
    twiml.say('It was my pleasure to help.');
    res.type('text/xml');
    res.send(twiml.toString());
  });

  app.listen(3000, () => {
    console.log(`agent server listening on port 3000`);
  });
}

init();