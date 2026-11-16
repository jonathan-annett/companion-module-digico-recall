import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { makeInstanceClass } from './instance.js'
import { UpgradeScripts } from './upgrades.js'

export { UpgradeScripts }

export default makeInstanceClass({ InstanceBase, InstanceStatus })
