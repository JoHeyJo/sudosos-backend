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
import { createQueryBuilder, SelectQueryBuilder } from 'typeorm';
import {
  ContainerResponse,
  ContainerWithProductsResponse,
  PaginatedContainerResponse,
} from '../controller/response/container-response';
import Container from '../entity/container/container';
import ContainerRevision from '../entity/container/container-revision';
import UpdatedContainer from '../entity/container/updated-container';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ProductService from './product-service';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import ContainerRequest from '../controller/request/container-request';
import User from '../entity/user/user';
import Product from '../entity/product/product';
import UpdatedProduct from '../entity/product/updated-product';
import ProductRevision from '../entity/product/product-revision';
import UnapprovedProductError from '../entity/errors/unapproved-product-error';
import { PaginationParameters } from '../helpers/pagination';

interface ContainerVisibility {
  own: boolean;
  public: boolean;
}

/**
 * Define updated container filtering parameters used to filter query results.
 */
export interface UpdatedContainerParameters {
  /**
   * Filter based on container id.
   */
  containerId?: number;
  /**
   * Filter based on container revision.
   */
  containerRevision?: number;
  /**
   * Filter based on container owner.
   */
  ownerId?: number;
}

/**
 * Define container filtering parameters used to filter query results.
 */
export interface ContainerParameters extends UpdatedContainerParameters {
  /**
   * Filter based on pointOfSale id.
   */
  posId?: number;
  /**
   * Filter based on pointOfSale revision.
   */
  posRevision?: number;
  /**
   * Whether to select public containers.
   */
  public?: boolean;
}

export default class ContainerService {
  /**
   * Helper function for the base mapping the raw getMany response container.
   * @param rawContainer - the raw response to parse.
   */
  private static asContainerResponse(rawContainer: any): ContainerResponse {
    return {
      id: rawContainer.id,
      revision: rawContainer.revision,
      name: rawContainer.name,
      createdAt: rawContainer.createdAt,
      updatedAt: rawContainer.updatedAt,
      public: !!rawContainer.public,
      owner: {
        id: rawContainer.owner_id,
        firstName: rawContainer.owner_firstName,
        lastName: rawContainer.owner_lastName,
      },
    };
  }

  private static buildGetContainersQuery(filters: ContainerParameters = {})
    : SelectQueryBuilder<Container> {
    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoin(
        ContainerRevision,
        'containerrevision',
        'container.id = containerrevision.container',
      )
      .innerJoin('container.owner', 'owner')
      .select([
        'container.id AS id',
        'container.public as public',
        'container.createdAt AS createdAt',
        'containerrevision.revision AS revision',
        'containerrevision.updatedAt AS updatedAt',
        'containerrevision.name AS name',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
      ]);

    const { posId, posRevision, ...p } = filters;

    if (posId !== undefined) {
      builder.innerJoin(
        (qb: SelectQueryBuilder<any>) => qb.from(PointOfSaleRevision, 'pos_revision')
          .innerJoin(
            'pos_revision.containers',
            'cc',
          )
          .where(
            `pos_revision.pointOfSaleId = ${posId} AND pos_revision.revision IN ${posRevision ? `(${posRevision})` : qb.subQuery()
              .from(PointOfSale, 'pos')
              .select('pos.currentRevision')
              .where(`pos.id = ${posId}`)
              .getSql()}`,
          )
          .select(['cc.containerId AS id', 'cc.revision AS revision']),
        'pos_container',
        'pos_container.id = container.id AND pos_container.revision = containerrevision.revision',
      );
    }

    const filterMapping: FilterMapping = {
      containerId: 'container.id',
      containerRevision: 'containerrevision.revision',
      ownerId: 'owner.id',
      public: 'container.public',
    };

    QueryFilter.applyFilter(builder, filterMapping, p);

    if (!(posId || p.containerRevision)) {
      builder.andWhere('container.currentRevision = containerrevision.revision');
    }

    return builder;
  }

  /**
   * Query for getting all containers based on user.
   * @param filters
   * @param pagination
   */
  public static async getContainers(
    filters: ContainerParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedContainerResponse> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      this.buildGetContainersQuery(filters).limit(take).offset(skip).getRawMany(),
      this.buildGetContainersQuery(filters).getCount(),
    ]);

    const records = results[0].map((rawContainer) => this.asContainerResponse(rawContainer));
    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  private static buildGetUpdatedContainersQuery(
    filters: UpdatedContainerParameters = {},
  ): SelectQueryBuilder<Container> {
    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoinAndSelect(
        UpdatedContainer,
        'updatedcontainer',
        'container.id = updatedcontainer.containerId',
      )
      .innerJoinAndSelect('container.owner', 'owner')
      .select([
        'container.id AS id',
        'container.public as public',
        'container.createdAt AS createdAt',
        'updatedcontainer.updatedAt AS updatedAt',
        'updatedcontainer.name AS name',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
      ]);

    const filterMapping: FilterMapping = {
      containerId: 'container.id',
      containerRevision: 'containerrevision.revision',
      ownerId: 'owner.id',
      public: 'container.public',
    };
    QueryFilter.applyFilter(builder, filterMapping, filters);

    return builder;
  }

  /**
   * Query to return all updated containers.
   * @param filters
   * @param pagination
   */
  public static async getUpdatedContainers(
    filters: UpdatedContainerParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedContainerResponse> {
    const { take, skip } = pagination;

    const results = await Promise.all([
      this.buildGetUpdatedContainersQuery(filters).limit(take).offset(skip).getRawMany(),
      this.buildGetUpdatedContainersQuery(filters).getCount(),
    ]);

    const records = results[0].map((rawContainer) => (this.asContainerResponse(rawContainer)));

    return {
      _pagination: {
        take, skip, count: results[1],
      },
      records,
    };
  }

  /**
   * Creates a new container.
   *
   * The newly created container resides in the Container table and has no
   * current revision. To confirm the revision the update has to be accepted.
   *
   * @param owner - The user that created the container.
   * @param container - The container to be created.
   */
  public static async createContainer(owner: User, container: ContainerRequest)
    : Promise<ContainerWithProductsResponse> {
    const base = Object.assign(new Container(), {
      owner,
      public: container.public,
    });

    // Save the base.
    await base.save();
    return this.updateContainer(base.id, container);
  }

  /**
   * Confirms an container update and creates a container revision.
   * @param containerId - The container update to confirm.
   */
  public static async approveContainerUpdate(containerId: number)
    : Promise<ContainerWithProductsResponse> {
    const [base, rawContainerUpdate] = (
      await Promise.all([Container.findOne(containerId), UpdatedContainer.findOne(containerId, { relations: ['products'] })]));

    // return undefined if not found or request is invalid
    if (!base || !rawContainerUpdate) {
      return undefined;
    }

    // Get the product id's for this update.
    const productIds: { revision: number, product: { id : number } }[] = (
      rawContainerUpdate.products.map((product) => (
        { revision: product.currentRevision, product: { id: product.id } })));

    const updatedProducts: UpdatedProduct[] = await UpdatedProduct.findByIds(productIds, { relations: ['product'] });

    if (updatedProducts.length !== 0) {
      throw new UnapprovedProductError('Container update has unapproved product(s).');
    }

    const productRevisions: ProductRevision[] = await ProductRevision.findByIds(productIds);

    // Set base container and apply new revision.
    const containerRevision: ContainerRevision = Object.assign(new ContainerRevision(), {
      container: base,
      products: productRevisions,
      name: rawContainerUpdate.name,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
    });

    // First save revision.
    await ContainerRevision.save(containerRevision);

    // Increment current revision.
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    await base.save();

    // Remove update after revision is created.
    await UpdatedContainer.delete(containerId);

    // Return the new container with products.
    return this.getProductsResponse(containerId, false);
  }

  /**
   * Creates a container update.
   * @param containerId - The ID of the product to update
   * @param update - The container variables to update.
   */
  public static async updateContainer(containerId: number, update: ContainerRequest)
    : Promise<ContainerWithProductsResponse> {
    // Get the base container.
    const base: Container = await Container.findOne(containerId);

    // return undefined if not found.
    if (!base) {
      return undefined;
    }

    let products: Product[] = [];
    await Promise.all(update.products.map((id) => Product.findOne(id)))
      .then((result) => { products = result.filter((p) => p); });

    // Set base container and apply new update.
    const updatedContainer = Object.assign(new UpdatedContainer(), {
      container: await Container.findOne(base.id),
      name: update.name,
      products,
    });

    // Save update
    await updatedContainer.save();

    // Return container with products.
    return this.getProductsResponse(base.id, true);
  }

  /**
   * Verifies whether the container request translates to a valid container
   * @param containerRequest - The request to verify
   * @returns {boolean} - whether container is ok or not
   */
  public static async verifyContainer(containerRequest: ContainerRequest) {
    return containerRequest.name !== ''
        && containerRequest.products.every(async (productId) => {
          await Product.findOne(productId, { where: 'currentRevision' });
        });
  }

  /**
   * Turns a ContainerResponse into a ContainerWithProductsResponse
   * @param containerId - The id of the container to return.
   * @param updated
   */
  public static async getProductsResponse(containerId: number, updated?: boolean)
    : Promise<ContainerWithProductsResponse> {
    // Get base container
    const containerResponse: ContainerResponse = updated
      ? ((await this.getUpdatedContainers({ containerId })).records[0])
      : ((await this.getContainers({ containerId })).records[0]);

    const containerProducts
    : ContainerWithProductsResponse = containerResponse as ContainerWithProductsResponse;

    // Fill products
    containerProducts.products = (await ProductService.getProducts(
      { containerId, updatedContainer: updated },
    )).records;
    return containerProducts;
  }

  /**
   * Test to see if the user can view a specified container
   * @param userId - The User to test
   * @param containerId - The container to view
   */
  public static async canViewContainer(userId: number, containerId: number)
    : Promise<ContainerVisibility> {
    const result: ContainerVisibility = { own: false, public: false };
    const container: Container = await Container.findOne(containerId, { relations: ['owner'] });
    if (!container) return result;
    if (container.owner.id === userId) result.own = true;
    if (container.public) result.public = true;
    return result;
  }
}
