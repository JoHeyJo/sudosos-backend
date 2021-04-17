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
import BorrelkaartGroupController from '../../../src/controller/borrelkaart-group-controller';
import BorrelkaartGroupRequest from '../../../src/controller/request/borrelkaart-group-request';
import BorrelkaartGroupResponse from '../../../src/controller/response/borrelkaart-group-response';
import Database from '../../../src/database';
import BorrelkaartGroup from '../../../src/entity/user/borrelkaart-group';
import User, { UserType } from '../../../src/entity/user/user';
import UserBorrelkaartGroup from '../../../src/entity/user/user-borrelkaart-group';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import Swagger from '../../../src/swagger';

function bkgEq(req: BorrelkaartGroupRequest, res: BorrelkaartGroupResponse): Boolean {
  // check if non user fields are equal
  if (!(req.name === res.name
    && Date.parse(req.activeStartDate) === Date.parse(res.activeStartDate)
    && Date.parse(req.activeEndDate) === Date.parse(res.activeEndDate))) {
    return false;
  }

  let usersOk = true;
  const reqIds = req.users.map((user) => user.id);
  const resIds = res.users.map((user) => user.id);

  // check if requested users in response users
  reqIds.forEach((id) => {
    if (!resIds.includes(id)) {
      usersOk = false;
    }
  });

  if (!usersOk) {
    return false;
  }

  // check if response users in requested users
  resIds.forEach((id) => {
    if (!reqIds.includes(id)) {
      usersOk = false;
    }
  });

  return usersOk;
}

describe('BorrelkaartGroupController', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: BorrelkaartGroupController,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
    validBorrelkaartGroupReqs: BorrelkaartGroupRequest[],
    invalidBorrelkaartGroupReq: BorrelkaartGroupRequest,
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

    // test borrelkaart groups
    const validBorrelkaartGroupReq = {
      name: 'coole groep',
      activeStartDate: '2100-01-01T17:00:00Z',
      activeEndDate: '2100-01-01T21:00:00Z',
      users: [
        adminUser,
        localUser,
      ],
    } as BorrelkaartGroupRequest;

    const validBorrelkaartGroupReq2 = {
      name: 'coole groep 2',
      activeStartDate: '2100-02-01T17:00:00Z',
      activeEndDate: '2100-02-01T21:00:00Z',
      users: [
        adminUser,
      ],
    } as BorrelkaartGroupRequest;

    const validBorrelkaartGroupReqs = [
      validBorrelkaartGroupReq,
      validBorrelkaartGroupReq2,
    ];

    const invalidBorrelkaartGroupReq = {
      ...validBorrelkaartGroupReq,
      name: '',
    } as BorrelkaartGroupRequest;

    // start app
    const app = express();
    const specification = await Swagger.initialize(app);
    const controller = new BorrelkaartGroupController(specification);
    app.use(bodyParser.json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/borrelkaartgroups', controller.getRouter());

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
      validBorrelkaartGroupReqs,
      invalidBorrelkaartGroupReq,
    };
  });

  // close database connection
  afterEach(async () => {
    await UserBorrelkaartGroup.clear();
    await User.clear();
    await BorrelkaartGroup.clear();
    await ctx.connection.close();
  });

  describe('verify borrelkaart group', () => {
    it('should return true when the borrelkaart is valid', async () => {
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.validBorrelkaartGroupReqs[0]), 'valid borrelkaart group incorrectly asserted as false').to.be.true;
    });
    it('should return false when the borrelkaart is invalid', async () => {
      // empty name
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'empty name').to.be.false;

      // invalid date
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReqs[0],
        activeStartDate: 'geen date format',
      } as BorrelkaartGroupRequest;
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'invalid date').to.be.false;

      // end date in past
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReqs[0],
        activeEndDate: '2000-01-01T21:00:00Z',
      } as BorrelkaartGroupRequest;
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'end date in past').to.be.false;

      // end date <= start date
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReqs[0],
        activeStartDate: '2000-01-01T21:00:00Z',
        activeEndDate: '2000-01-01T21:00:00Z',
      } as BorrelkaartGroupRequest;
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'end date <= start date').to.be.false;

      // no users given
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReqs[0],
        users: [],
      } as BorrelkaartGroupRequest;
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'no users given').to.be.false;

      // distinct user id's
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReqs[0],
        users: [
          ctx.adminUser,
          ctx.localUser,
          {
            id: 3,
            firstName: 'fail user',
            type: UserType.LOCAL_USER,
            active: true,
          },
          {
            id: 3,
            firstName: 'fail user 2',
            type: UserType.LOCAL_USER,
            active: true,
          },
        ],
      } as BorrelkaartGroupRequest;
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'user ids not distinct').to.be.false;

      // a user not in database
      ctx.invalidBorrelkaartGroupReq = {
        ...ctx.validBorrelkaartGroupReqs[0],
        users: [
          ctx.adminUser,
          ctx.localUser,
          {
            id: 3,
            firstName: 'fail user',
            type: UserType.LOCAL_USER,
            active: true,
          },
        ],
      } as BorrelkaartGroupRequest;
      expect(await ctx.controller.verifyBorrelkaartGroup(ctx.invalidBorrelkaartGroupReq), 'user not in database').to.be.false;
    });
  });

  describe('GET /borrelkaartgroups', () => {
    it('should return an HTTP 200 and all borrelkaart groups without users in the database if admin', async () => {
      // save borrelkaart group
      const bkg = {
        name: ctx.validBorrelkaartGroupReqs[0].name,
        activeStartDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeStartDate),
        activeEndDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeEndDate),
      } as BorrelkaartGroup;
      await BorrelkaartGroup.save(bkg);

      // get borrelkaart groups
      const res = await request(ctx.app)
        .get('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // check if borrelkaart groups are returned without users
      const borrelkaartGroups = res.body as BorrelkaartGroup[];
      expect(borrelkaartGroups.length, 'size of response not equal to size of database').to.equal(await BorrelkaartGroup.count());

      // success code
      expect(res.status, 'incorrect status on get').to.equal(200);
    });
    it('should return an HTTP 403 if not admin', async () => {
      const res = await request(ctx.app)
        .get('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.token}`);

      // check no response body
      expect(res.body, 'body not empty').to.be.empty;

      // forbidden code
      expect(res.status, 'incorrect status on forbidden get').to.equal(403);
    });
  });

  describe('POST /borrelkaartgroups', () => {
    it('should store the given borrelkaart group and its users in the database and return an HTTP 200 and the borrelkaart group with users if admin', async () => {
      // post borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.validBorrelkaartGroupReqs[0]);

      // check if response correct
      const bkgRes = res.body as BorrelkaartGroupResponse;

      // check if borrelkaart group in database
      const borrelkaartGroup = await BorrelkaartGroup.findOne(bkgRes.id);
      expect(borrelkaartGroup, 'did not find borrelkaart group').to.not.be.undefined;

      // check if user in database
      const bkgRelation = await UserBorrelkaartGroup.findOne(bkgRes.users[0].id, { relations: ['borrelkaartGroup'] });
      expect(bkgRelation.borrelkaartGroup.id, 'user not linked to borrelkaart group').to.equal(bkgRes.id);

      // success code
      expect(res.status, 'status incorrect on valid post').to.equal(200);
    });
    it('should return an HTTP 400 if the given borrelkaart group is invalid', async () => {
      // post invalid borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send(ctx.invalidBorrelkaartGroupReq);

      // invalid borrelkaart group response response
      expect(res.body, 'borrelkaart group not invalidated').to.equal('Invalid borrelkaart group.');

      // check if banner not in database
      const borrelkaartGroup = await BorrelkaartGroup
        .findOne({ name: ctx.invalidBorrelkaartGroupReq.name });
      expect(borrelkaartGroup, 'borrelkaart group in databse on invalid post').to.be.undefined;

      // invalid code
      expect(res.status, 'status incorrect on invalid post').to.equal(400);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // post borrelkaart group
      const res = await request(ctx.app)
        .post('/borrelkaartgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validBorrelkaartGroupReqs[0]);

      // check no response body
      expect(res.body, 'body not empty on forbidden post').to.be.empty;

      // forbidden code
      expect(res.status, 'status incorrect on forbidden post').to.equal(403);
    });
  });

  describe('GET /borrelkaartgroups/:id', () => {
    it('should return an HTTP 200 and the borrelkaart group and users with given id if admin', async () => {
      // save borrelkaart group
      const bkg = {
        name: ctx.validBorrelkaartGroupReqs[0].name,
        activeStartDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeStartDate),
        activeEndDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeEndDate),
      } as BorrelkaartGroup;
      await BorrelkaartGroup.save(bkg);

      // save user links to borrelkaart group
      const userLinks: UserBorrelkaartGroup[] = ctx.validBorrelkaartGroupReqs[0].users
        .map((user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup));
      await UserBorrelkaartGroup.save(userLinks);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      const bkgRes = res.body as BorrelkaartGroupResponse;

      expect(bkgRes, 'borrelkaart group not found').to.not.be.empty;
      expect(bkgEq(ctx.validBorrelkaartGroupReqs[0], bkgRes), 'returned borrelkaart group not correct').to.be.true;

      // success code
      expect(res.status).to.equal(200);
    });
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist', async () => {
      // save borrelkaart group
      const bkg = {
        name: ctx.validBorrelkaartGroupReqs[0].name,
        activeStartDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeStartDate),
        activeEndDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeEndDate),
      } as BorrelkaartGroup;
      await BorrelkaartGroup.save(bkg);

      // save user links to borrelkaart group
      const userLinks: UserBorrelkaartGroup[] = ctx.validBorrelkaartGroupReqs[0].users
        .map((user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup));
      await UserBorrelkaartGroup.save(userLinks);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/2')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.body, 'borrelkaart group found while id not in database').to.equal('Borrelkaart group not found.');

      // not found code
      expect(res.status).to.equal(404);
    });
    it('should return an HTTP 403 if not admin', async () => {
      // save borrelkaart group
      const bkg = {
        name: ctx.validBorrelkaartGroupReqs[0].name,
        activeStartDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeStartDate),
        activeEndDate: new Date(ctx.validBorrelkaartGroupReqs[0].activeEndDate),
      } as BorrelkaartGroup;
      await BorrelkaartGroup.save(bkg);

      // save user links to borrelkaart group
      const userLinks: UserBorrelkaartGroup[] = ctx.validBorrelkaartGroupReqs[0].users
        .map((user) => ({ user, borrelkaartGroup: bkg } as UserBorrelkaartGroup));
      await UserBorrelkaartGroup.save(userLinks);

      // get borrelkaart group by id
      const res = await request(ctx.app)
        .get('/borrelkaartgroups/1')
        .set('Authorization', `Bearer ${ctx.token}`);

      const bkgRes = res.body as BorrelkaartGroupResponse;

      expect(bkgRes, 'borrelkaart group returned').to.be.empty;

      // forbidden code
      expect(res.status).to.equal(403);
    });
  });

  describe('PATCH /borrelkaartgroups/:id', () => {
    it('should update and return an HTTP 200 and the borrelkaart group and users with given id if admin');
    it('should return an HTTP 400 if given borrelkaart group is invalid');
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist');
    it('should return an HTTP 403 if not admin');
  });

  describe('DELETE /borrelkaartgroups/:id', () => {
    it('should delete the borrelkaart group and user links from the database and return an HTTP 200 and the borrelkaart group with given id if admin');
    it('should return an HTTP 404 if the borrelkaart group with given id does not exist');
    it('should return an HTTP 403 if not admin');
  });
});
