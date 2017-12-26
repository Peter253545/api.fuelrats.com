'use strict'

const { Rat, Rescue } = require('../db')
const RescueStatisticsQuery = require('../Query/RescueStatisticsQuery')
const SystemStatisticsQuery = require('../Query/SystemStatisticsQuery')
const RatsStatisticsQuery = require('../Query/RatsStatisticsQuery')
const { CustomPresenter } = require('../classes/Presenters')
const APIEndpoint = require('../APIEndpoint')


class Statistics extends APIEndpoint {
  async rescues (ctx) {
    let rescuesQuery = new RescueStatisticsQuery(ctx.query, ctx)
    let result = await Rescue.scope(null).findAll(rescuesQuery.toSequelize)
    let results = result.map((result) => { return result.toJSON() })
    return RescueStatisticsPresenter.render(results, ctx.meta(result, rescuesQuery))
  }

  async systems (ctx) {
    let systemQuery = new SystemStatisticsQuery(ctx.query, ctx)
    let result = await Rescue.scope(null).findAll(systemQuery.toSequelize)
    let results = result.map((result) => { return result.toJSON() })
    return SystemStatisticsPresenter.render(results, ctx.meta(result, systemQuery))
  }

  async rats (ctx) {
    let ratsQuery = new RatsStatisticsQuery(ctx.query, ctx)
    let result = await Rat.scope('stats').findAll(ratsQuery.toSequelize)
    return RatStatisticsPresenter.render(result, ctx.meta(result, ratsQuery))
  }
}


class RescueStatisticsPresenter extends CustomPresenter {
  id (instance) {
    return instance.date || null
  }
}
RescueStatisticsPresenter.prototype.type = 'rescuestatistics'

class SystemStatisticsPresenter extends CustomPresenter {
  id (instance) {
    return instance.system || null
  }
}
SystemStatisticsPresenter.prototype.type = 'systemstatistics'

class RatStatisticsPresenter extends CustomPresenter {
  id (instance) {
    return instance.id || null
  }
}
RatStatisticsPresenter.prototype.type = 'ratstatistics'

module.exports = Statistics