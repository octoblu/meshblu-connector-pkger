#!/usr/bin/env node
const OctoDash = require("octodash")
const path = require("path")
const ora = require("ora")
const packageJSON = require("./package.json")
const { MeshbluConnectorPkger } = require("./src/pkger")

const CLI_OPTIONS = [
  {
    names: ["connector-path"],
    type: "string",
    required: true,
    env: "MESHBLU_CONNECTOR_PATH",
    help: "Location of meshblu connector, defaults to current directory",
    helpArg: "PATH",
    default: ".",
    completionType: "file",
  },
  {
    names: ["target"],
    type: "string",
    env: "MESHBLU_CONNECTOR_TARGET",
    help: "platform target, will default to auto detect",
    helpArg: "TARGET",
  },
  {
    names: ["max-old-space-size"],
    type: "number",
    default: 20,
    env: "MESHBLU_CONNECTOR_MAX_OLD_SPACE_SIZE",
    help: "Set the v8 flag max_old_space_size for the connector. Size in megabytes.",
    helpArg: "SIZE_IN_MB",
  },
  {
    names: ["node-version"],
    type: "string",
    env: "MESHBLU_CONNECTOR_NODE_VERSION",
    help: "Node version to compile in",
    helpArg: "VERSION",
    default: "8",
  },
  {
    names: ["pkg-fetch-version"],
    type: "bool",
    help: "Get pkg-fetch version",
  },
  {
    names: ["pkg-version"],
    type: "bool",
    help: "Get pkg version",
  },
]

class MeshbluConnectorPkgerCommand {
  constructor({ argv, cliOptions = CLI_OPTIONS } = {}) {
    this.octoDash = new OctoDash({
      argv,
      cliOptions,
      name: packageJSON.name,
      version: packageJSON.version,
    })
  }
  run() {
    const options = this.octoDash.parseOptions()
    if (options.pkgFetchVersion) {
      console.log(require("pkg-fetch/package.json").version)
      return Promise.resolve()
    }
    if (options.pkgVersion) {
      console.log(require("pkg/package.json").version)
      return Promise.resolve()
    }
    const { connectorPath, target, nodeVersion, maxOldSpaceSize } = options
    const spinner = ora("Pkg-ing connector").start()

    const pkger = new MeshbluConnectorPkger({
      connectorPath: path.resolve(connectorPath),
      nodeVersion,
      spinner,
      target,
      maxOldSpaceSize,
    })
    return pkger
      .package()
      .then(() => spinner.succeed("Ship it!"))
      .catch(error => {
        spinner.fail(error.message)
        throw error
      })
  }
}

const command = new MeshbluConnectorPkgerCommand({ argv: process.argv })
command
  .run()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    if (error) {
      if (error.stdout) console.error(error.stdout)
      if (error.stderr) console.error(error.stderr)
      console.error(error)
    }
    process.exit(1)
  })
