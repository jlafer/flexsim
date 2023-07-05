require("dotenv").config();
const express = require('express');

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
        to: to
      });
    res.status(200).send({});
  });

  app.listen(3000, () => {
    console.log(`agentsim listening on port 3000`)
  });
}

init();