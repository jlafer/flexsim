# flexsim
This project is a Twilio Flex activity simulator.

This tool can generate a pseudo-random Flex configuration, deploy Flex infrastructure into a Twilio project, simulate a Flex workload and the handling of the workload, thus simulating the activity one might expect to see in a customer environment. The activity can then be used for a few different purposes: demos of realtime dashboards; generation of data for Flex Insights demos; testing of TR workflows; and feeding semi-realistic test data to EventStreams.

The system is composed of multiple, independent components: configuration generator, infrastructure deployer, customer simulator and agent simulator. There is also a cleanup script to remove in-process tasks and, optionally, the deployed resources.

## genconfig
The configuration generator script reads a simulation domain description and produces configuration files as output. It is used at simulation design time and only needs to run when the domain description has changed. The domain description and/or configuration files can be checked into source control and shared among users. The script does not require a Twilio project to execute.

## deploy
The infrastructure deployment script reads the configuration files and executes against a specific Twilio Flex project. It is used at deployment time and only needs to run when the project is out of sync with the configuration files, such as if they have been regenerated by `genconfig`.

Deployment consists of building Workers, TaskQueues and a Workflow. It does not touch any resources created outside of the `flexsim` configuration, so you can deploy into an existing Flex project without explicit conflicts.

NOTE: Care must be taken when other tasks are being routed in the project to ensure they are not handled by `flexsim` agents. Conversely, tasks generated by `flexsim` could be routed to your other Workers if the routing criteria overlap. This could be what you want if, for example, you want to login to Flex and handle tasks generated by the customer simulator.

## agentsim
The agent simulator script reads the configuration files, performs a login of the `flexsim` agents and makes them Available for work. When TaskRouter assigns them a Task, they "handle" it. It can run in any Flex project that has infrastructure in sync with the configuration files. It can run in the background during the presentation of a demo using that project.

## custsim
The customer simulator script reads the configuration files and generates Tasks that are then routed to the simulation agents. The configuration files control the arrival rate, channels, customer intents and other parameters. Most behaviors are semi-random, meaning they have targets but can vary in a pseudo-random fashion around their target.

## Configuration
The system has four execution modes: configuration generation, infrastructure deployment, simulation and (as needed) cleanup. The configuration generation mode uses a combination of default values and user-supplied inputs to generate a set of JSON configuration files. The deployment, simulation and cleanup modules then read the configuration files when executing against a Flex project.

### Defaults
For ease of use, the configuration generator can be run without any input from the user, simply by relying on default values. This will support a bare-bones, generic simulation environment. The configuration generator uses the default values to describe the simulation domain. These values can then be overridden by the user via a combination of a `domain.json` file and command-line options. It then uses the combination of those values to generate the configuration files used during the other modes of operation.

### domain.json
For saving a custom simulation domain description, the user can provision a file, named `domain.json`. The `genconfig` script can read this file and generate configuration files based on the description there.  This allows the user to control nearly every aspect of the resulting simulation: tasks, channels, agent counts, customer intents, routing criteria, handle times, agent activities, etc.

### Command-line Options
Each `flexsim` script supports a set of command-line options, which can be used to make dynamic changes to its operation. Most of these relate to file locations, task volumes, agent counts and other quantitative aspects of the resulting simulation runs.
 
### Environment Variables
The scripts that use a Twilio project can use the following environment variables to reference that project and Workspace:
- ACCOUNT_SID
- AUTH_TOKEN
- WRKSPC_SID

The `agentsim` script also uses a variable to specify the HTTP listening port.
- PORT

A `.env` file placed in the project root folder can be used to supply those variables to all scripts. See `.env.sample` for a template.

### Preparing a Flex Project for flexsim
The simulation builds and deploys a TR Workflow that uses the configured Task attributes, routing criteria and Worker attributes to select and reserve the `flexsim` agents. When a reservation is made, Twilio calls the Workflow-specified assignment callback URL, in order to let the `agentsim` program know that an agent has been assigned a task and that it should now start "handling" the task. That URL can be configured by the user and must reference the host and port of the `agentsim` script, which must be publicly accessible. On a development machine, this can be done using a tunnel service like `ngrok`.

## Script Execution
In the project directory, there are five NodeJS scripts.

### genconfig
To start the `genconfig` script:
```
node ./src/deploy [--domain dir] [--cfgdir dir]
```
The optional command-line options include:
- `domaindir` specifies the directory where the `domain.json` file, if any, is located
- `cfgdir` specifies the directory where the configuration files should be written

### deploy
To start the `deploy` script:
```
node ./src/deploy [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located

- Authentication credentials can also be supplied via the command line, overriding any found in the environment.


### agentsim
`agentsim` is an Express server that handles tasks in a specific Twilio project and TR workspace.

Currently, `agentsim` must be started and the agents should be signed-in before `custsim`.

It supports a single URL path:
- `/reservation` is called by the TR assignment callback to request acceptance of the task by a specific agent. The script uses this request to trigger simulated handling of each task.

To start the `agentsim` script:
```
node ./src/agentsim [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located

- Authentication credentials can also be supplied via the command line, overriding any found in the environment.
 
### custsim
To start the `custsim` script:
```
node ./src/custsim [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located

- Authentication credentials can also be supplied via the command line, overriding any found in the environment.


### cleansim
To start the `cleansim` script:
```
node ./src/cleansim [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located

- Authentication credentials can also be supplied via the command line, overriding any found in the environment.


## Changelog

### 0.0.1
- This is the initial "beta" release for SE testing.
