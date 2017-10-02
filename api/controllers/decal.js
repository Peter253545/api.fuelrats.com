'use strict'

const Error = require('../errors')
const Decal = require('../classes/Decal')
const User = require('../db').User
const Permission = require('../permission')
const DecalsPresenter = require('../classes/Presenters').DecalsPresenter

class Decals {
  static async check (ctx) {
    if (Object.keys(ctx.query).length > 0) {
      if (Permission.require(['user.read'], ctx.state.user, ctx.state.scope)) {
        let user = await User.findOne({
          where: ctx.query
        })

        if (!user) {
          throw Error.template('not_found', 'user')
        }

        return await Decal.checkEligible(user)
      }
    } else {
      return await Decal.checkEligible(ctx.state.user.data)
    }
  }

  static async redeem (ctx) {
    let decal = await Decal.getDecalForUser(ctx.state.user.data)
    return DecalsPresenter.render(decal)
  }
}



module.exports = Decals