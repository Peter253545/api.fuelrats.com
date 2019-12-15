
import Permissions from './Permission'
import { User } from '../db'
import { Context } from '../classes/Context'

const eect = Buffer.from('YXBwbGljYXRpb24vY29mZmVlLXBvdC1jb21tYW5k', 'base64').toString('utf8')
// noinspection SpellCheckingInspection
const eeEs = Buffer.from('SW1BVGVhcG90QVBJRXJyb3I=', 'base64').toString('utf8')
const EeAe = require('./APIError')[eeEs]

const hourTimer = 60 * 60 * 1000

const allowedUnauthenticatedRequestCount = 360
const allowedAuthenticatedRequestCount = 3600
const allowedAdminRequestCount = 10000


/**
 * Class for managing the rate of traffic from IP addresses and users
 * @class
 */
export default class TrafficControl {
  #resetTimer = 0

  /**
   * Create a new instance of a Traffic Controller with fresh hash tables and reset clock
   */
  constructor () {
    this.reset()
  }

  /**
   *
   * @param {object} arg function arguments object
   * @param {Context} arg.connection A websocket client or Express.js request object
   * @param {boolean} arg.increase Whether this validation should also increase the request count by 1
   * @returns {object} An object containing whether the rate limit is exceeded, how many requests are left,
   * and the total requests
   */
  validateRateLimit ({ connection, increase = true }) {
    if (connection.req.type === eect) {
      throw new EeAe()
    }

    let entity
    if (connection.state.user) {
      entity = this.retrieveAuthenticatedEntity({ user: connection.state.user })
    } else {
      entity = this.retrieveUnauthenticatedEntity({ remoteAddress: connection.inet })
    }

    const valid = entity.remainingRequests > 0
    if (valid && increase) {
      entity.count += 1
    }
    return {
      exceeded: !valid,
      remaining: entity.remainingRequests,
      total: entity.totalRequests
    }
  }

  /**
   * Retrieve an authenticated entity with the number of requests made by this user, or create one
   * @param {User} user - The user associated with this request
   * @returns {object} An instance of AuthenticatedUserEntity
   */
  retrieveAuthenticatedEntity ({ user }) {
    let entity = this.authenticatedRequests[user.id]
    if (!entity) {
      entity = new AuthenticatedUserEntity({ user })
      this.authenticatedRequests[user.id] = entity
    }
    return entity
  }

  /**
   * Retrieve an unauthenticated entity with the number of requests made by this IP address, or create one
   * @param {string} remoteAddress - The remote address associated with this request
   * @returns {object} an instance of RemoteAddressEntity
   */
  retrieveUnauthenticatedEntity ({ remoteAddress }) {
    let entity = this.unauthenticatedRequests[remoteAddress]
    if (!entity) {
      entity = new RemoteAddressEntity({ remoteAddress })
      this.unauthenticatedRequests[remoteAddress] = entity
    }
    return entity
  }

  /**
   * Get the next time all rate limits will be reset (The next full hour)
   * @returns {Date} A date object containing the next time all rate limits will be reset
   */
  get nextResetDate () {
    return new Date(Math.ceil(new Date().getTime() / hourTimer) * hourTimer)
  }

  /**
   * Get the remaining milliseconds until the next time all rate limits will be reset (the next full hour)
   * @returns {number} A number with the number of milliseconds until the next rate limit reset
   * @private
   */
  get remainingTimeToNextResetDate () {
    return this.nextResetDate.getTime() - new Date().getTime()
  }

  /**
   * Reset all rate limits
   * @private
   */
  reset () {
    this.authenticatedRequests = {}
    this.unauthenticatedRequests = {}
    this.#resetTimer = setTimeout(this.reset.bind(this), this.remainingTimeToNextResetDate)
  }
}

/**
 * Base class representing a request traffic entity
 * @class
 */
class TrafficEntity {
  #requestCount = 0

  /**
   * Get the number of requests made by this entity during the rate limit period
   * @returns {number} number of requests made by this entity during the rate limit period
   */
  get count () {
    return this.#requestCount
  }

  /**
   * Set the number of requests made by this entity during the rate limit period
   * @param {number} count The number of requests made by this entity during the rate limit period
   */
  set count (count) {
    this.#requestCount =  count
  }
}

/**
 * Class representing an authenticated user containing their requests the last clock hour
 * @class
 */
class AuthenticatedUserEntity extends TrafficEntity {
  #user = undefined
  #requestCount = 0

  /**
   * Create an entity representing the traffic made by a specific authenticated user
   * @param {object} arg function arguments object
   * @param {User} arg.user - The user object of the authenticated user this traffic belongs to
   * @param {number} arg.initialCount Optional parameter containing the number of requests this entity should start with
   */
  constructor ({ user, initialCount = 0 }) {
    super()
    this.#user = user
    this.#requestCount = initialCount
  }

  /**
   * Whether the authenticated user this entity belongs to is an admin
   * @returns {boolean} true if the authenticated user this entity belongs to is an admin
   */
  get isAdmin () {
    const user = this.#user
    return Permissions.groups.find((group) => {
      return group.isAdministrator && user.groups.find((uGroup) => {
        return uGroup.id === group.id
      })
    })
  }

  /**
   * Get the number of remaining requests this entity has in this period
   * @returns {number} the number of remaining requests this entity has in this period
   */
  get remainingRequests () {
    if (this.isAdmin) {
      return allowedAdminRequestCount - this.#requestCount
    }
    return allowedAuthenticatedRequestCount - this.#requestCount
  }

  /**
   * Get the total number of requests allowed by this entity
   * @returns {number} total number of requests
   */
  get totalRequests () {
    if (this.isAdmin) {
      return allowedAdminRequestCount
    }
    return allowedAuthenticatedRequestCount
  }
}

/**
 * Class representing an unauthenticated remote address containing their requests the last clock hour
 */
class RemoteAddressEntity extends TrafficEntity {
  #remoteAddress = undefined
  #requestCount = 0

  /**
   * Create an entity representing the traffic made by a specific unauthenticated remote address
   * @param {object} arg function arguments object
   * @param {string} arg.remoteAddress The remote address this traffic belongs to
   * @param {number} [arg.initialCount] Optional parameter containing the number of requests this entity should start
   */
  constructor ({ remoteAddress, initialCount = 0 }) {
    super()
    this.#remoteAddress = remoteAddress
    this.#requestCount = initialCount
  }

  /**
   * Get the number of remaining requests this entity has in this period
   * @returns {number} the number of remaining requests this entity has in this period
   */
  get remainingRequests () {
    return allowedUnauthenticatedRequestCount - this.#requestCount
  }

  /**
   * Get the total number of requests
   * @returns {number} total number of requests
   */
  get totalRequests () {
    return allowedUnauthenticatedRequestCount
  }
}
