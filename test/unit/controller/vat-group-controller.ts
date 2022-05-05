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
import { Connection } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import { json } from 'body-parser';
import { expect, request } from 'chai';
import VatGroupController from '../../../src/controller/vat-group-controller';
import User, { UserType } from '../../../src/entity/user/user';
import VatGroup from '../../../src/entity/vat-group';
import { UpdateVatGroupRequest, VatGroupRequest } from '../../../src/controller/request/vat-group-request';
import Database from '../../../src/database/database';
import { seedVatGroups } from '../../seed';
import TokenHandler from '../../../src/authentication/token-handler';
import Swagger from '../../../src/start/swagger';
import RoleManager from '../../../src/rbac/role-manager';
import TokenMiddleware from '../../../src/middleware/token-middleware';
import { defaultPagination, PaginationResult } from '../../../src/helpers/pagination';

describe('VatGroupController', () => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    controller: VatGroupController,
    user: User,
    token: string,
    vatGroups: VatGroup[],
    validVatGroupReq: VatGroupRequest,
    validUpdateVatGroupReq: UpdateVatGroupRequest,
  };

  before(async () => {
    const connection = await Database.initialize();

    const user = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
    } as User);
    const vatGroups = await seedVatGroups();

    // create bearer tokens
    const tokenHandler = new TokenHandler({
      algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
    });
    const token = await tokenHandler.signToken({ user, roles: ['Admin'] }, 'nonce admin');

    const validUpdateVatGroupReq: UpdateVatGroupRequest = {
      name: 'CustomVATGroup',
      hideIfZero: false,
    };
    const validVatGroupReq: VatGroupRequest = {
      ...validUpdateVatGroupReq,
      percentage: 39,
    };

    const app = express();
    const specification = await Swagger.initialize(app);

    const all = { all: new Set<string>(['*']) };
    const roleManager = new RoleManager();
    roleManager.registerRole({
      name: 'Admin',
      permissions: {
        VatGroup: {
          create: all,
          get: all,
          update: all,
          delete: all,
        },
      },
      assignmentCheck: async (usr: User) => usr.type === UserType.LOCAL_ADMIN,
    });

    const controller = new VatGroupController({ specification, roleManager });
    app.use(json());
    app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
    app.use('/vatgroups', controller.getRouter());

    ctx = {
      connection,
      app,
      specification,
      controller,
      user,
      token,
      vatGroups,
      validVatGroupReq,
      validUpdateVatGroupReq,
    };
  });

  after(async () => {
    await ctx.connection.close();
  });

  describe('GET /banners', () => {
    it('should return an HTTP 200 and all VAT groups', async () => {
      const res = await request(ctx.app)
        .get('/vatgroups')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);

      const vatGroups = res.body.records as VatGroup[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(vatGroups.length).to.equal(ctx.vatGroups.length);
      vatGroups.forEach((vatGroup) => {
        const validation = ctx.specification.validateModel('VatGroup', vatGroup, false, true);
        expect(validation.valid).to.be.true;
      });

      expect(pagination.take).to.equal(defaultPagination());
      expect(pagination.skip).to.equal(0);
      expect(pagination.count).to.equal(ctx.vatGroups.length);
    });
    it('should adhere to pagination', async () => {
      const take = 3;
      const skip = 2;
      const res = await request(ctx.app)
        .get('/vatgroups')
        .query({ take, skip })
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);

      // number of VAT groups returned is number of banners in database
      const vatGroups = res.body.records as VatGroup[];
      // eslint-disable-next-line no-underscore-dangle
      const pagination = res.body._pagination as PaginationResult;

      expect(pagination.take).to.equal(take);
      expect(pagination.skip).to.equal(skip);
      expect(pagination.count).to.equal(ctx.vatGroups.length);
      expect(vatGroups.length).to.be.at.most(take);
    });
    it('should filter on VAT group name', async () => {
      const { name } = ctx.vatGroups[0];
      const actualNrOfGroups = ctx.vatGroups.filter((g) => g.name === name).length;

      const res = await request(ctx.app)
        .get('/vatgroups')
        .query({ name })
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);

      const vatGroups = res.body.records as VatGroup[];

      expect(vatGroups.length).to.equal(actualNrOfGroups);
      vatGroups.forEach((g) => {
        expect(g.name).to.equal(name);
      });
    });
    it('should filter on VAT group percentage', async () => {
      const { percentage } = ctx.vatGroups[1];
      const actualNrOfGroups = ctx.vatGroups.filter((g) => g.percentage === percentage).length;

      const res = await request(ctx.app)
        .get('/vatgroups')
        .query({ percentage })
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);

      const vatGroups = res.body.records as VatGroup[];

      expect(vatGroups.length).to.equal(actualNrOfGroups);
      vatGroups.forEach((g) => {
        expect(g.percentage).to.equal(percentage);
      });
    });
    it('should filter on VAT group hide if zero', async () => {
      const hideIfZero = true;
      const actualNrOfGroups = ctx.vatGroups.filter((g) => g.hideIfZero === hideIfZero).length;

      const res = await request(ctx.app)
        .get('/vatgroups')
        .query({ hideIfZero })
        .set('Authorization', `Bearer ${ctx.token}`);

      const vatGroups = res.body.records as VatGroup[];

      expect(vatGroups.length).to.equal(actualNrOfGroups);
      vatGroups.forEach((g) => {
        expect(g.hideIfZero).to.equal(hideIfZero);
      });
    });
  });

  describe('POST /vatgroups', () => {
    it('should store the given VAT group in the database and return an HTTP 200 and the VAT group', async () => {
      const count = await VatGroup.count();
      const res = await request(ctx.app)
        .post('/vatgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validVatGroupReq);

      expect(res.status).to.equal(200);
      expect(await VatGroup.count()).to.equal(count + 1);

      const validation = ctx.specification.validateModel('VatGroup', res.body, false, true);
      expect(validation.valid).to.be.true;
    });
    it('should return an HTTP 400 if VAT group has negative percentage', async () => {
      const invalidVatGroupReq = {
        ...ctx.validVatGroupReq,
        percentage: -39,
      };

      const res = await request(ctx.app)
        .post('/vatgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(invalidVatGroupReq);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid VAT group.');
    });
    it('should return an HTTP 400 if VAT group has empty name', async () => {
      const invalidVatGroupReq = {
        ...ctx.validVatGroupReq,
        name: '',
      };

      const res = await request(ctx.app)
        .post('/vatgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(invalidVatGroupReq);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid VAT group.');
    });
    it('should return an HTTP 400 if property missing', async () => {
      const invalidVatGroupReq: VatGroupRequest = {
        ...ctx.validVatGroupReq,
        name: undefined,
      };

      const res = await request(ctx.app)
        .post('/vatgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(invalidVatGroupReq);

      expect(res.status).to.equal(400);
    });
  });

  describe('GET /vatgroups/{id}', () => {
    it('should return an HTTP 200 and the VAT group with the given ID', async () => {
      const { id } = ctx.vatGroups[0];

      const res = await request(ctx.app)
        .get(`/vatgroups/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(200);

      const validation = ctx.specification.validateModel('VatGroup', res.body, false, true);
      expect(validation.valid).to.be.true;
    });
    it('should return an HTTP 404 if VAT group does not exist', async () => {
      const id = ctx.vatGroups[0].id + 1000;

      const res = await request(ctx.app)
        .get(`/vatgroups/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('VAT group not found.');
    });
  });

  describe('PATCH /vatgroups/{id}', () => {
    it('should update and return an HTTP 200 with the VAT group with the given id', async () => {
      const { id } = ctx.vatGroups[1];

      const res = await request(ctx.app)
        .patch(`/vatgroups/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validUpdateVatGroupReq);

      expect(res.status).to.equal(200);

      const vatGroup = res.body as VatGroup;
      expect(vatGroup.name).to.equal(ctx.validUpdateVatGroupReq.name);
      expect(vatGroup.hideIfZero).to.equal(ctx.validUpdateVatGroupReq.hideIfZero);
    });
    it('should return HTTP 400 if VAT group has empty name', async () => {
      const invalidVatGroupReq = {
        ...ctx.validVatGroupReq,
        name: '',
      };

      const res = await request(ctx.app)
        .post('/vatgroups')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(invalidVatGroupReq);

      expect(res.status).to.equal(400);
      expect(res.body).to.equal('Invalid VAT group.');
    });
    it('should return HTTP 400 if changing percentage', async () => {
      const { id } = ctx.vatGroups[0];

      const res = await request(ctx.app)
        .patch(`/vatgroups/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ percentage: 21 });

      expect(res.status).to.equal(400);
    });
    it('should return HTTP 404 if VAT group does not exist with given id', async () => {
      const id = ctx.vatGroups[0].id + 1000;

      const res = await request(ctx.app)
        .patch(`/vatgroups/${id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(ctx.validUpdateVatGroupReq);

      expect(res.status).to.equal(404);
      expect(res.body).to.equal('VAT group not found.');
    });
  });
});
