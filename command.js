#!/usr/bin/env node
const dashdash = require("dashdash")
const path = require("path")
const chalk = require("chalk")
const ora = require("ora")
const { MeshbluConnectorPkger } = require("./src/pkger")

const CLI_OPTIONS = [
  {
    name: "version",
    type: "bool",
    help: "Print connector version and exit.",
  },
  {
    names: ["help", "h"],
    type: "bool",
    help: "Print this help and exit.",
  },
  {
    names: ["connector-path"],
    type: "string",
    env: "MESHBLU_CONNECTOR_PATH",
    help: "Location of meshblu connector, defaults to current directory",
    helpArg: "PATH",
    default: ".",
  },
  {
    names: ["target"],
    type: "string",
    env: "MESHBLU_CONNECTOR_TARGET",
    help: "platform target, will default to auto detect",
    helpArg: "PATH",
  },
]

class MeshbluConnectorPkgerCommand {
  constructor(options) {
    if (!options) options = {}
    var { argv, cliOptions } = options
    if (!cliOptions) cliOptions = CLI_OPTIONS
    if (!argv) return this.die(new Error("MeshbluConnectorPkgerCommand requires options.argv"))
    this.argv = argv
    this.cliOptions = cliOptions
    this.parser = dashdash.createParser({ options: this.cliOptions })
  }

  parseArgv({ argv }) {
    try {
      var opts = this.parser.parse(argv)
    } catch (e) {
      return {}
    }

    if (opts.help) {
      console.log(`usage: meshblu-connector-pkger [OPTIONS]\noptions:\n${this.parser.help({ includeEnv: true, includeDefault: true })}`)
      process.exit(0)
    }

    if (opts.version) {
      console.log(this.packageJSON.version)
      process.exit(0)
    }

    return opts
  }

  run() {
    const options = this.parseArgv({ argv: this.argv })
    const { connector_path, target } = options
    var errors = []
    if (!connector_path) errors.push(new Error("MeshbluConnectorCommand requires --connector-path or MESHBLU_CONNECTOR_PATH"))

    if (errors.length) {
      console.log(`usage: meshblu-connector-pkger [OPTIONS]\noptions:\n${this.parser.help({ includeEnv: true, includeDefault: true })}`)
      errors.forEach(error => {
        console.error(chalk.red(error.message))
      })
      return Promise.reject()
    }

    const spinner = ora("Pkg-ing connector").start()

    const pkger = new MeshbluConnectorPkger({ connectorPath: path.resolve(connector_path), spinner, target })
    return pkger.package().then(() => spinner.succeed("Ship it!")).catch(error => {
      spinner.fail(error.message)
      return Promise.reject(error)
    })
  }

  die(error) {
    console.error("Meshblu Connector Installer Command: error: %s", error.message)
    process.exit(1)
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
