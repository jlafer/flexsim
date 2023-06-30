# flexsim
This project is a Twilio Flex activity simulator.

It can generate a Flex configuration, deploy Flex infrastructure into a Twilio project, simulate a pseudo-random customer workload, and simulate agent behaviors, including the handling of the workload. It thus simulates the activity one might expect to see in a customer environment. The activity can then be used for a few different purposes:
- demos of the Flex realtime dashboards
- generation of data for Flex Insights demos
- testing of TR workflows
- testing of Flex plugins
- feeding semi-realistic events to EventStreams

The system is composed of multiple, independent scripts: configuration generator, infrastructure deployer, customer simulator and agent simulator. There is also a cleanup script to remove in-process tasks and, optionally, the deployed simulator resources from a Flex project.

## genconfig
The configuration generator script reads a simulation domain description and outputs configuration files. It is used at simulation design time and only needs to run when the domain description has changed. The domain description and/or configuration files can be checked into source control and shared among users. The script does not require a Twilio project to execute and the configuration files contain no Twilio SIDs that tie them to a specific project.

## deploy
The infrastructure deployment script reads the configuration files and executes against a specific Twilio Flex project. It is used at deployment time and only needs to run when the project is out of sync with the configuration files, such as if they have been regenerated by `genconfig` or edited manually.

Deployment consists of building Workers, TaskQueues and a Workflow. It does not touch any resources created outside of the `flexsim` configuration, so you can deploy into an existing Flex project without conflict.

NOTE: Care must be taken when other tasks are being routed in the project to ensure they are not handled by `flexsim` agents. Conversely, tasks generated by `flexsim` could be routed to your other Workers if the routing criteria overlap. This could be what you want, for example, if you login to Flex and handle tasks generated by the simulator.

## agentsim
The agent simulator script reads the configuration files, performs a login of the `flexsim` agents and makes them Available for work. When TaskRouter assigns them a Task, they "handle" it. The agents will also change their activity state occasionally, in a pseudo-random manner. It can run in any Flex project that has infrastructure in sync with the configuration files. It can run in the background during the presentation of a demo using that project.

## custsim
The customer simulator script reads the configuration files and generates Tasks that are then routed to the simulation agents by the TaskRouter workflow deployed previously. The configuration files control the arrival rate, channels, customer intents and other parameters. Most activity durations, such as talk time, and attribute values are semi-random, meaning they have target values but will vary in a pseudo-random fashion around their target.

## Configuration
The system has four execution modes: configuration generation, infrastructure deployment, simulation and (as needed) cleanup. The configuration generation mode uses a combination of localized default values and an optional, user-supplied `domain.json` file to generate a set of JSON configuration files. The deployment, simulation and cleanup modules then read the configuration files when executing against a Flex project.

### Defaults
For ease of use, the configuration generator can be run without any input from the user, simply by relying on default domain values. This will support a bare-bones, generic simulation environment. The default values have been chosen to support a typical SE-led customer demo. They are not very realistic but they do make for a lively demo in the Flex realtime dashboards. Thus, the defaults may not be appropriate for other use cases.

The defaults have been localized for US English and are read (by default) from a file at `localization/en-us.json`. The `flexsim` system can be localized for a different locale by creation of a different defaults file, which can then be specified using the `--locale` option to the `genconfig` and `custsim` scripts.

The default values can then be overridden by the user using a combination of a `domain.json` file and command-line options. The `genconfig` script uses the combination of those values to generate the configuration files.

### domain.json
For saving a custom simulation domain description, the user can provision a file named `domain.json` to supplement and/or override the defaults. It can be placed in a directory of the user's choice. The `genconfig` script can read this file, merge it with the values read from the localized defaults file, and generate the configuration files. This allows the user to control nearly every aspect of the resulting simulation: tasks, channels, agent counts, customer intents, routing criteria, handle times, agent activities, etc.

The domain file can be used to override the value-generation parameters for standard properties and to supply custom properties, as described below.

The format of the file is documented below. You can also inspect the `src/helpers/schema.js` file to see a JSON Schema definition for the file and inspect the `domain.json` file in the `domain` folder for an example. These should get the early adopter started. :-)

### Command-line Options
Each `flexsim` script supports a set of command-line options, which can be used to make dynamic changes to its operation. Most of these relate to Flex credentials, file locations and simulation length. See the `execution.txt` file for sample command lines.
 
### Environment Variables
The scripts that use a Twilio project can use the following environment variables to reference that project and Workspace:
- ACCOUNT_SID
- AUTH_TOKEN
- WRKSPC_SID

The `genconfig` and simulation scripts accept a variable to set a seed value for the random number generator. Use of a seed value will make simulator execution deterministic (i.e., repeatable and predicable).

- RANDOM_SEED

The `agentsim` script also accepts a variable to specify the HTTP listening port. If you use a tunneling program like `ngrok`, it should reference this port.
- AGENTSIM_PORT

A `.env` file placed in the project root folder can be used to supply those variables to all scripts. See `.env.sample` for a template.

### Preparing a Flex Project for flexsim

#### Task Channels
If you specify any non-standard channels in your domain, make sure the corresponding TaskChannels have been created in the target Flex project prior to running `custsim`. 

#### Worker Activities
If you specify any non-standard Worker activities in your domain, make sure they have been created in the target Flex project prior to running `agentsim`.

#### Skills
To avoid conflicts with the existing configuration of your target Flex project, the `deploy` script does not build `routing.skills` values nor the proficiencies, if specified in your domain (and they are by default). Thus, you should use the Flex Admin page, under the Skills menu choice, to define any of the skills that can be assigned to agents. By default these are: "Sales", "Service" and "Support".

## Localization
The simulator supports localization. Default values for domain properties are read from a localized file, which can be specified using the `--locale` command-line option. Currently, the only default domain-values file supplied is for US English. The project maintainers are looking for assistance in creating default values files for other locales.

When a locale is specified, `genconfig` will generate localized agent names and `custsim` will generate localized customer names. Currently, the supported locales for naming people include: 'en_us', 'es_sp', 'de_de' and 'fr_fr'.

## Script Execution
In the project directory, there are five NodeJS scripts. See the `execution.txt` file in the project root directory for sample command lines to run these scripts.

### genconfig
To run the `genconfig` script:
```
node ./src/genconfig [--domaindir dir] [--cfgdir dir] [--locale code] [--seed abcde]
```
The optional command-line options include:
- `domaindir` specifies the directory where the `domain.json` file, if any, is located
- `cfgdir` specifies the directory where the configuration files should be written
- `locale` specifies the name of a locale, which is a 5-letter language and country code (following the ISO 639-1 and ISO 3166-1 standards, e.g., 'es_sp').
- `seed` sets a seed value for the random number generator for predictable results from the script

### deploy
To run the `deploy` script:
```
node ./src/deploy [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx] [--assignURL url]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located
- `assignURL` specifies the ssignment callback URL to be written into the generated Workflow; this should refer to the `agentsim` host and listening port

- Authentication credentials can also be supplied via the command line, overriding any found in the environment.


### agentsim
`agentsim` is an Express server that handles tasks in a specific Twilio project and TR workspace.

Currently, `agentsim` must be started and the agents should be signed-in before `custsim` is started.

It supports a single URL path:
- `/reservation` is called by the TR assignment callback to request acceptance of the task by a specific agent. The script uses this request to trigger simulated handling of each task.

To start the `agentsim` script:
```
node ./src/agentsim [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx] [--port num] [--seed abcde]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located
- `port` specifies the HTTP port on which the program listens for assignment callbacks from TaskRouter; if not specified here or in the environment, the default is 3000
- `seed` sets a seed value for the random number generator for predictable results from the script

- Authentication credentials can also be supplied via the command line, overriding any found in the environment.

#### agentsim must be publicly accessible
The simulation builds and deploys a TR Workflow that uses the configured Task attributes, routing criteria and Worker attributes to select and reserve the `flexsim` agents. When a reservation is made, Twilio calls the Workflow-specified assignment callback URL, in order to let the `agentsim` program know that an agent has been assigned a task and that it should now start "handling" the task. That URL can be configured by the user and must reference the host and port of the `agentsim` script, which must be publicly accessible. On a development machine, this can be done using a tunnel service like `ngrok`.

### custsim
To run the `custsim` script:
```
node ./src/custsim [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx] [--timeLim num] [--locale code] [--seed abcde]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located
- `timeLim` specifies the length of execution time, in seconds; if not specified, the default is 3600 seconds
- `locale` specifies the name of a locale, which is a 5-letter language and country code (following the ISO 639-1 and ISO 3166-1 standards, e.g., 'es_sp').
- `seed` sets a seed value for the random number generator for predictable results from the script
- Authentication credentials can also be supplied via the command line, overriding any found in the environment.


### cleansim
To run the `cleansim` script:
```
node ./src/cleansim [--cfgdir dir] [--acct ACxxx] [--auth abcde] [--wrkspc WSxxxx] [--dletWorkers boolean]
```
The optional command-line options include:
- `cfgdir` specifies the directory where the configuration files to be read are located
- `dletWorkers` indicates whether the simulation agents should also be removed from the project
- Authentication credentials can also be supplied via the command line, overriding any found in the environment.

NOTE: if you receive an error message saying that the Workflow could not be found, this probably means your configuration has changed significantly since deployment (or nothing has been deployed). You can always manually delete old simulation resources via the Twilio Console.

## Domain Schema
The localization files and optional `domain.json` file must adhere to the same specific JSON schema.

The domain description consists of an object with a set of required property keys.

### brand
The value is used to name the generated Workflow and to mark Workers and Tasks as belonging to `flexsim`, using a `flexsim` attribute.

### agentCnt
This specifies the number of simulation agents generated by `genconfig`.

### queueFilterProp
This specifies the enum value property (see below) that will be used to generate the Filters in the Workflow.

### queueWorkerProps
This specifies the enum value property that will be used to generate the worker expressions in the TaskQueue objects.

### props
This is an object, which contains a set of configurable domain value properties. Each value property has a name and other parameters that specify its data-type, range of values, and parameters for the generation of pseudo-random values and where they are used (e.g., worker attribute, task attribute).

### Standard Value Props
There is a set of standard value properties that must be present for the simulation to run correctly. All of the standard properties are supplied by the localization file, but their parameters can be overridden by including them in a domain file. The standard properties that must be present include the following:

#### arrivalGap
This is the mean time between new inbound tasks arriving from customers.

#### channel
This is the set of task channels that can be used by customer tasks. Every configured value must be present in the target Twilio project as `deploy` does not build these automatically.

#### abandonTime
This is the mean time before customers will abandon their task if not yet accepted by an agent.

#### waitTime
This is the actual time that the task waited before being accepted by an agent. It has a custom calculation and can not be configured by the user but this prop must be present in the localization file. It can be used to influence the value of other properties (e.g., customer satisfaction metrics).

#### talkTime
This is the mean "talk" time for tasks once accepted by an agent.

#### wrapTime
This is the mean "wrapping" time for tasks once accepted by an agent.

#### activity
This is the set of worker Activity codes that can be used by the agents. Every configured value must be present in the target Twilio project as `deploy` does not build these automatically.

### Custom Value Props
The user can also specify and configure their own custom properties under `props`. One use of custom properties is to generate values for Worker and Task attributes. The localized defaults files already include a few custom value props (e.g., topic) but if the user supplies any custom value props in a domain file, they will be removed and only those from the domain file will be generated into the configuration.

### Value Props JSON Schema
Each value prop must adhere to a strict schema. Many of the parameters have default values and can be omitted by the user. Those defaults are documented below.

The key of each value prop is treated as its name. The name becomes relevant when the value is saved as a worker or task attribute, or when referenced in the formula for calculating another prop value (see `influences` below).

#### dataType
This specifies the data type of the prop. Valid values are: `string`, `number`, `integer` and `boolean`.
The default value is `string`.

#### expr
This specifies the expression of the values. Valid values are: `enum` and `range`.
The default value is `enum`.

#### values
This is an array and specifies the possible values for the prop. It only applies to an `enum` expression prop.
There are no default values.

#### min
This specifies the minimum value for the prop. It only applies to a `range` expression prop.
The default value is 0.

#### max
This specifies the maximum value for the prop. It only applies to a `range` expression prop.
The default value is 1.

#### instances
All of the value prop parameters above describe the conceptual "value domain" of a prop. The `instances` parameter is used to define how that prop is actually generated and used in the simulation. This parameter is a JSON array because there must be at least one instance of each value prop but there can be more than one. For example, the `topic` prop might be instantiated as both a Worker property and as a Task property. The following parameters are included in each instance, which is a JSON object.

#### entity
This specifies the data entity that provides the location for the instance of the prop. Valid values are: `tasks` and `workers`.
The default value is `tasks`.

#### phase
This specifies the lifecycle phase (or event) when the value for the prop instance is generated. Valid values are: `deploy`, `activity`, `arrive`, `assign` and `complete`.
The default value is `arrive` for tasks and `deploy` for workers.

#### instName
This allows the instance name to be different than the prop name, when instantiated in the entity.
The default value is the name of the prop.

#### isAttribute
This is a boolean and indicates whether the prop instance should be written as an attribute for its entity. Valid values are: `true` and `false`. A value of `false` can be useful for generating numeric values that will not be written as an attribute but which can be used to influence other prop instance values.
The default value is `true`.

#### curve
This specifies the . Valid values are: `uniform` and `bell`.
The default value is `uniform` for enumerated values and `bell` for range values.

#### valueCnt
This is an integer and specifies the number of values to generate for the prop instance. Valid values are: 1 or more. If the value is not one, the values are stored as an array.
The default value is `1`.

#### valueProps
This is an array of objects and specifies additional parameters used for the generation of the prop's values. It only applies to `enum` props. If specified, there must be one member of this array for each member of the `values` array in the parent prop. Each object in the array has a single required key: `portion`, which indicates the target incidence of the corresponding value being generated for the prop instance at runtime.
If omitted, the simulation will evenly generate all of the values in the prop's `values` array. For example, if three values are specified in the prop's enumeration, each value will occur roughly one third of the time.

Specific standard value props expect additional keys in the `valueProps` objects.
- The `channel` prop's instance expects a `baseCapacity` key whose integer value specifies the default capacity of Workers for the corresponding channel value.
- The `activity` prop's instance expects a `baseDur` key whose integer value specifies the default duration that Workers spend in the corresponding activity.

#### influences
This is an array of objects and specifies how other value props influence the value generated for this one. Each object in the array must contain the following keys: `factor`, `effect` and `amount`.
- `factor` specifies the influencing value prop instance. It must refer to the instance of a `range` prop that is calculated in the same or a previous `phase`. For example, a prop instance that is generated during task completion can be influenced by factors generated in the `deploy`, `arrive`, `assign` or `complete` phases. However, a prop instance in the `assign` phase cannot be influenced by a factor that is not generated until the `complete` phase. Also, a prop instance in the `task` entity can be influenced by factors in either the `worker` or `task` entities. This parameter has the format `<prop name>.<instance name>`. It can reference another custom prop instance or any of the following standard ones: `waitTime.waitTime`, `talkTime.talkTime`, `wrapTime.wrapTime`. Finally, if influencing an `enum` prop instance, treat it's `min` and `max` values as 0 and 1 when specifying the amount of shifting.
- `effect` specifies the type of influence; the only valid value currently is `shift`
- `amount` specifes the weight of the influence and is expressed as a fraction of the factor's value difference from its target mean

Influences are best understood with an example. Let's say the `csat` prop instance should be influenced by the task `talkTime` factor. The CSAT varies between 1 and 5 with a mean of 3, whereas talk time varies between 0 and 100 secs with a mean of 50. And for a particular task, the actual talk time is 25 secs and the pre-influences CSAT value is 2.

Now assume the following `influences` configuration for the `csat` prop instance:
```
[{
  "factor": "talkTime.talkTime",
  "effect": "shift",
  "amount": -0.05
}]
```
The calculation process for the final `csat` value would flow like this:
- A `talkTime` value of 25 is 25 less (i.e., -25) than the expected mean of 50.
- Multiplied by the influence `amount` of -0.05 results in a shift of `csat` by +1.25.
- The pre-influences `csat` value of 2 is now shifted to 3.25 and rounded to the integer value of 3.

## Using flexsim in a Demo
When using `flexsim` in a demo, here are some tips:
- All simulated agents start out in an Available state and it takes awhile for the random nature of the simulation to place agents in a mixture of activities that is both realistic and in line with the configured value-percentages. Thus, start `agentsim` at least 10 minutes before your demo.

## Known Limitations
- The project has not yet reached a "1.0" status and there will be breaking changes from time to time.
- The building of test cases has only just started. Please report any bugs and every atttempt will be made to get them resolved quickly.
- The tasks generated by `custsim` are real TaskRouter tasks but they are not linked to any media (e.g., voice or text). Thus, the user can't click on a task in the TeamsView, for example, and expect to listen to an active call or see a chat transcript. This capability is under consideration.
- Only inbound tasks are currently supported.
- Only `uniform` and `bell` distributions are currently  supported for `range` values. The `log`arithmic distribution is not yet supported.
- Only `shift` effects can be used in `influences`. The `skew` effect is not yet supported.
- The generated (default) intent values often don't make logical sense, given the generated topic values.

## Changelog

### 0.0.1
- This is the initial "beta" release for SE testing.
### 0.0.2
- The domain schema has been documented (see above).
- A breaking change has been made to the schema to improve and rationalize default values, parameter naming and the use of influences.
  - The `calculation` property has been removed.
- The first set of test cases has been added.
- Checks on the validity of JSON in the domain file has been strengthened.
- Bug fixes:
  - Task attributes set during task arrival are no longer overwritten at task completion.
### 0.0.3
- If the `valueProps` property for an instance of a value prop is omitted from your `domain.json` file, the `genconfig` script will evenly generate all of the values in the prop's `values` array.
- The capacity of all workers for each channel can be specified in the domain file, using the `baseCapacity` property for each value in the `channel` prop's (only) instance.
- All configuration and randomization logic has moved to a separate library package, [flexsim-lib](https://www.npmjs.com/package/flexsim-lib), so that it can be shared with the configuration UI (coming soon). The library code can be found at [jlafer/flexsim-lib](https://github.com/jlafer/flexsim-lib).
