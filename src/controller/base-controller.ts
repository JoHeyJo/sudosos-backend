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
import express, { Router, RequestHandler } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import Policy, { MethodPolicy } from './policy';
import PolicyMiddleware from '../middleware/policy-middleware';
import RequestValidatorMiddleware from '../middleware/request-validator-middleware';
import RoleManager from '../rbac/role-manager';
import RestrictionMiddleware from '../middleware/restriction-middleware';

/**
 * This interface is a wrapper around all the parameters of the BaseController,
 * such that changes are easily reflected in all other controllers.
 */
export interface BaseControllerOptions {
  specification: SwaggerSpecification,
  roleManager: RoleManager,
}

/**
 * The BaseController class is responsible for:
 * - Storing route definitions.
 * - Generating router objects based on the policy.
 */
export default abstract class BaseController {
  /**
   * The express router used by this controller.
   */
  private router: Router;

  /**
   * A reference to the swagger specification passed in the base controller options.
   */
  protected specification: SwaggerSpecification;

  /**
   * A reference to the role manager passed in the base controller options.
   */
  protected roleManager: RoleManager;

  /**
   * Defines a new route on the router. Private helper function to reduce code duplication.
   * @param spec
   * @param route The route string.
   * @param methodPolicy The policy which should be added to the router.
   * @param callback The addition function of the appropiate method of the router.
   */
  private static defineRoute(
    spec: SwaggerSpecification,
    route: string,
    methodPolicy: MethodPolicy,
    callback: (route: string, ...handler: RequestHandler[]) => void,
  ) {
    const handlers: RequestHandler[] = [];
    if (methodPolicy.body) {
      const validator = new RequestValidatorMiddleware(spec, methodPolicy.body);
      handlers.push(validator.getMiddleware());
    }
    handlers.push(new PolicyMiddleware(methodPolicy.policy).getMiddleware());
    handlers.push(new RestrictionMiddleware(() => methodPolicy.restrictions || {}).getMiddleware());
    handlers.push(methodPolicy.handler);
    callback(
      route,
      ...handlers,
    );
  }

  /**
   * Creates a new controller instance, and generates the router based on its defined policy.
   * @options - The options from which to extract parameters.
   */
  public constructor(options: BaseControllerOptions) {
    this.router = express.Router({ strict: true });
    this.specification = options.specification;
    this.roleManager = options.roleManager;

    const spec = options.specification;

    // Generate routes based on the policy
    const policy = this.getPolicy();
    Object.keys(policy).forEach((route: string) => {
      const routePolicy = policy[route];
      const bind = (f: Function) => f.bind(this.router);
      if (routePolicy.GET) {
        BaseController.defineRoute(spec, route, routePolicy.GET, bind(this.router.get));
      }
      if (routePolicy.POST) {
        BaseController.defineRoute(spec, route, routePolicy.POST, bind(this.router.post));
      }
      if (routePolicy.PATCH) {
        BaseController.defineRoute(spec, route, routePolicy.PATCH, bind(this.router.patch));
      }
      if (routePolicy.DELETE) {
        BaseController.defineRoute(spec, route, routePolicy.DELETE, bind(this.router.delete));
      }
      if (routePolicy.PUT) {
        BaseController.defineRoute(spec, route, routePolicy.PUT, bind(this.router.put));
      }
    });

    // If the request is not handled by the above handlers, the method is not supported.
    Object.keys(policy).forEach((route: string) => {
      this.router.use(route, (_req, res) => res.status(405).end('Method not allowed.'));
    });
  }

  /**
   * Gets the policy defined by child classes. This policy includes all routes that the controller
   * accepts, the authorization middleware, and the final handler function for every route.
   * @returns The policy of this controller.
   */
  public abstract getPolicy(): Policy;

  /**
   * @returns the router used by this controller.
   */
  public getRouter(): Router {
    return this.router;
  }
}
