import { User, Rat, db } from '../db'
import Anope from '../classes/Anope'
import Verifications from './Verifications'
import Sessions from './Sessions'
import Announcer from '../classes/Announcer'

import API, {
  getJSONAPIData,
  POST,
  required
} from './API'
import { ConflictAPIError, UnprocessableEntityAPIError } from '../classes/APIError'
import StatusCode from '../classes/StatusCode'


const platforms = ['pc', 'xb', 'ps']

/**
 * @classdesc Endpoint handling user registration
 * @class
 */
export default class Register extends API {
  /**
   * @inheritdoc
   */
  get type () {
    return 'registrations'
  }

  /**
   * Register a new account
   * @endpoint
   */
  @POST('/register')
  @required(
    'email', 'password', 'name', 'platform', 'nickname'
  )
  async create (ctx) {
    const formData = getJSONAPIData({ ctx, type: 'registrations' })

    await Register.checkExisting(formData.attributes)
    const { email, name, nickname, password, platform } = formData.attributes

    await db.transaction(async (transaction) => {
      const user = await User.create({
        email,
        password
      }, { transaction })

      if (platforms.includes(platform) === false) {
        throw new UnprocessableEntityAPIError({
          pointer: '/data/attributes/platform'
        })
      }

      const rat = await Rat.create({
        name,
        platform,
        userId: user.id
      }, { transaction })

      user.rats = [rat]

      await Anope.addNewUser({
        email,
        nick: nickname,
        encryptedPassword: `bcrypt:${user.password}`,
        vhost: user.vhost()
      })
      await Verifications.createVerification(user, transaction)

      await Announcer.sendModeratorMessage({
        message: `[Registration] User with email ${email} registered. Nickname: ${nickname}. 
        CMDR name: ${name} (IP: ${ctx.ip})`
      })
      return Sessions.createVerifiedSession(ctx, user, transaction)
    })

    ctx.response.status = StatusCode.created
    return true
  }

  /**
   * Check if an existing account with this information already exists
   * @param {object} args function arguments object
   * @param {string} args.email account email
   * @param {string} args.name rat name
   * @param {string} args.platform gaming platform
   * @returns {Promise<undefined>} resolves a promise if successful
   */
  static async checkExisting ({ email, name, platform }) {
    const existingUser = await User.findOne({ where: {
      email: {
        ilike: email
      }
    } })
    if (existingUser) {
      throw new ConflictAPIError({ pointer: '/data/attributes/email' })
    }

    const existingRat = await Rat.findOne({ where: {
      name: {
        ilike: name
      },
      platform
    } })
    if (existingRat) {
      throw new ConflictAPIError({ pointer: '/data/attributes/name' })
    }
  }
}
