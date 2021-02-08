/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import bodyParser from 'body-parser';
import { expect, request } from 'chai';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { Connection } from 'typeorm';
import TokenHandler from '../../../src/authentication/token-handler';
import BannerController from '../../../src/controller/banner-controller';
import BannerRequest from '../../../src/controller/request/banner-request';
import Database from '../../../src/database';
import Banner from '../../../src/entity/banner';
import User, { UserType } from '../../../src/entity/user/user';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import Swagger from '../../../src/swagger';

// verify whether the banner request translates to a valid banner object
function verifyBanner(spec: SwaggerSpecification, bannerRequest: BannerRequest): void {
  // validate specifications
  // const validation = spec.validateModel('BannerRequest', bannerRequest, false, true);
  // expect(validation).to.be.true;

  // check types
  expect(bannerRequest.name).to.be.a('string');
  expect(bannerRequest.picture).to.be.a('string');
  expect(bannerRequest.duration).to.be.a('number');
  expect(bannerRequest.active).to.be.a('boolean');
  expect(bannerRequest.startDate).to.be.a('string');
  expect(bannerRequest.endDate).to.be.a('string');

  expect(bannerRequest.name).to.not.be.empty;
  expect(bannerRequest.picture).to.not.be.empty;
  expect(bannerRequest.duration).to.be.above(0);
  expect(bannerRequest.active).to.not.be.null;

  const sDate = new Date(Date.parse(bannerRequest.startDate));
  const eDate = new Date(Date.parse(bannerRequest.endDate));
  expect(sDate).to.be.a('date');
  expect(eDate).to.be.a('date');
  expect(eDate).to.be.greaterThan(sDate);
}

describe('BannerController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: BannerController,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    validBannerReq: BannerRequest,
    validBanner: Banner,
  };

  // initialize context
  beforeEach(async () => {
    // initialize test database
    const connection = await Database.initialize();

    // create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
    } as User;

    const localUser = {
      id: 2,
      firstName: 'User',
      type: UserType.LOCAL_USER,
      active: true,
    } as User;

    await User.save(adminUser);
    await User.save(localUser);

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const adminToken = await tokenHandler.signToken({ user: adminUser }, 'nonce admin');
    const token = await tokenHandler.signToken({ user: localUser }, 'nonce');

    // test banners
    const validBannerReq = {
      name: 'valid banner',
      picture: 'some picture link',
      duration: 10,
      active: true,
      startDate: '2021-02-29T16:00:00Z',
      endDate: '2021-02-30T16:00:00Z',
    } as BannerRequest;

    const validBanner = {
      name: 'valid banner',
      picture: 'some picture link',
      duration: 10,
      active: true,
      startDate: new Date(Date.parse('2021-02-29T16:00:00Z')),
      endDate: new Date(Date.parse('2021-02-30T16:00:00Z')),
    } as Banner;

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new BannerController(specification);
    app.use(bodyParser.json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/banners', controller.getRouter());

    // initialize context
    ctx = {
      connection,
      app,
      specification,
      controller,
      adminUser,
      localUser,
      adminToken,
      token,
      validBannerReq,
      validBanner,
    };
  });

  // close database connection
  afterEach(async () => {
    await User.clear();
    await Banner.clear();
    await ctx.connection.close();
  });

  describe('GET /banners', () => {
    it('should return an HTTP 200 and all banners in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // number of banners returned is number of banners in database
      const banners = res.body as Banner[];
      expect(banners.length).to.equal(await Banner.count());

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/banners')
        .set('Authorization', `Bearer ${ctx.token}`);

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('POST /banners', () => {
    it('should store the given banner in the database and return an HTTP 200 and the banner if admin', async () => {
      // number of banners in the database
      const count = await Banner.count();
      const res = await request(ctx.app)
        .post('/banners')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBannerReq);

      verifyBanner(ctx.specification, ctx.validBannerReq);

      // check if number of banners in the database increased
      expect(count + 1).to.equal(await Banner.count());

      // check if posted banner is indeed in the database
      const databaseBanner = await Banner.findOne(count + 1);
      const check = {
        ...databaseBanner,
      } as Banner;
      // expect(ctx.validBanner).to.equal(check);

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 400 if the given banner is invalid');
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .post('/banners')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validBannerReq);
      expect(res.status).to.equal(403);
    });
  });

  describe('GET /banners/:id', () => {
    it('should return an HTTP 200 and the banner with given id if admin', async () => {
      await Banner.save(ctx.validBanner);
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the banner with given id does not exist', async () => {
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      console.log(res.body);
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      await Banner.save(ctx.validBanner);
      const res = await request(ctx.app)
        .get('/banners/1')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
  });

  describe('PATCH /banners/:id', () => {
    it('should update and return an HTTP 200 and the banner with given id if admin');
    it('should return an HTTP 400 if given banner is invalid');
    it('should return an HTTP 404 if the banner with given id does not exist');
    it('should return an HTTP 403 if not admin');
  });

  describe('DELETE /banners/:id', () => {
    it('should delete the banner from the database and return an HTTP 200 and the banner with given id if admin');
    it('should return an HTTP 404 if the banner with given id does not exist');
    it('should return an HTTP 403 if not admin');
  });

  describe('GET /banners/active', () => {
    it('should return an HTTP 200 and all active banners in the database if admin', async () => {
      const res = await request(ctx.app)
        .get('/banners/active')
        .set('Authorization', `Bearer ${ctx.adminToken}`);
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/banners/active')
        .set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).to.equal(403);
    });
  });
});

// https://stackabuse.com/testing-node-js-code-with-mocha-and-chai/
