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
import Product from '../entity/product/product';
import UpdatedProduct from '../entity/product/updated-product';
import ProductRevision from '../entity/product/product-revision';
import { PaginationParameters } from '../helpers/pagination';
import { getIdsAndRequests } from '../helpers/array-splitter';
import { CreateContainerParams, UpdateContainerParams } from '../controller/request/container-request';
import { ProductRequest, UpdateProductParams } from '../controller/request/product-request';
import ProductImage from '../entity/file/product-image';
import User from '../entity/user/user';

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
  returnProducts?: boolean;
  productId?: number;
}

export default class ContainerService {
  /**
   * Helper function for the base mapping the raw getMany response container.
   * @param rawContainer - the raw response to parse.
   */
  private static asContainerResponse(rawContainer: any): ContainerResponse {
    return {
      id: rawContainer.container_public,
      revision: rawContainer.container_revision,
      name: rawContainer.container_name,
      createdAt: rawContainer.container_createdAt,
      updatedAt: rawContainer.container_updatedAt,
      public: !!rawContainer.container_public,
      owner: {
        id: rawContainer.owner_id,
        firstName: rawContainer.owner_firstName,
        lastName: rawContainer.owner_lastName,
      },
    };
  }

  private static buildGetContainersQuery(filters: ContainerParameters = {})
    : SelectQueryBuilder<Container> {
    const selection = [
      'container.id AS container_id',
      'container.public as container_public',
      'container.createdAt AS container_createdAt',
      'containerrevision.revision AS container_revision',
      'containerrevision.updatedAt AS container_updatedAt',
      'containerrevision.name AS container_name',
      'container_owner.id AS owner_id',
      'container_owner.firstName AS owner_firstName',
      'container_owner.lastName AS owner_lastName',
    ];

    const builder = createQueryBuilder()
      .from(Container, 'container')
      .innerJoin(
        ContainerRevision,
        'containerrevision',
        'container.id = containerrevision.container',
      )
      .innerJoin('container.owner', 'container_owner')
      .select(selection);

    const {
      posId, posRevision, returnProducts, ...p
    } = filters;

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

    if (returnProducts || filters.productId) {
      builder.innerJoinAndSelect('containerrevision.products', 'products');
      builder.innerJoinAndSelect('products.category', 'category');
      builder.innerJoin(Product, 'base_product', 'base_product.id = products.productId');
      builder.innerJoinAndSelect(User, 'product_owner', 'product_owner.id = base_product.owner.id');
      builder.leftJoinAndSelect(ProductImage, 'product_image', 'product_image.id = base_product.imageId');
      selection.push(
        'products.productId AS product_id',
        'products.revision as product_revision',
        'products.createdAt AS product_createdAt',
        'products.updatedAt AS product_updatedAt',
        'products.name AS product_name',
        'products.price AS product_price',
        'products.categoryId AS product_category_id',
        'products.category AS product_category_name',
        'products.alcoholpercentage AS product_alcoholpercentage',
        'product_image.downloadName as product_image',
        'product_owner.id AS product_owner_id',
        'product_owner.firstName AS product_firstName',
        'product_owner.lastName AS product_lastName',
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

  public static async combineProducts(rawResponse: any[]) {
    const collected: ContainerWithProductsResponse[] = [];
    const mapping = new Map<string, ContainerWithProductsResponse>();
    rawResponse.forEach((response) => {
      // Use a string of revision + id as key
      const key = JSON.stringify({
        revision: response.container_revision,
        id: response.container_id,
      });

      const rawProduct = {
        id: response.products_productId,
        revision: response.products_revision,
        alcoholpercentage: response.products_alcoholPercentage,
        category_id: response.products_categoryId,
        category_name: response.category_name,
        createdAt: response.products_createdAt,
        owner_id: response.product_owner_id,
        owner_firstName: response.product_owner_firstName,
        owner_lastName: response.product_owner_lastName,
        image: response.product_image_downloadName,
        name: response.products_name,
        price: response.products_price,
      };

      const productResponse = ProductService.asProductResponse(rawProduct);

      if (mapping.has(key)) {
        mapping.get(key).products.push(productResponse);
      } else {
        const containerWithProductsResponse: ContainerWithProductsResponse = {
          ...this.asContainerResponse(response),
          products: [productResponse],
        };

        mapping.set(key, containerWithProductsResponse);
      }
    });
    mapping.forEach((entry) => {
      collected.push(entry);
    });
    return collected;
  }

  /**
   * Query for getting all containers.
   * @param filters
   * @param pagination
   */
  public static async getContainers(
    filters: ContainerParameters = {}, pagination: PaginationParameters = {},
  ): Promise<PaginatedContainerResponse> {
    const { take, skip } = pagination;

    const builder = this.buildGetContainersQuery(filters);

    const results = await Promise.all([
      builder.limit(take).offset(skip).getRawMany(),
      this.buildGetContainersQuery({ ...filters, returnProducts: false }).getCount(),
    ]);

    let records;
    if (filters.returnProducts) {
      records = await this.combineProducts(results[0]);
    } else {
      records = results[0].map((rawContainer) => this.asContainerResponse(rawContainer));
    }

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

    const builder = this.buildGetUpdatedContainersQuery(filters);

    const results = await Promise.all([
      builder.limit(take).offset(skip).getRawMany(),
      builder.getCount(),
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
   * @param container - The params that describe the container to be created.
   */
  public static async createContainer(container: CreateContainerParams)
    : Promise<ContainerWithProductsResponse> {
    const base = Object.assign(new Container(), {
      public: container.public,
      owner: container.ownerId,
    });

    // Save the base.
    await base.save();

    const update: UpdateContainerParams = {
      ...container,
      id: base.id,
    };

    return this.updateContainer(update);
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

    // All products with a pending update are also updated
    const updatedProducts: UpdatedProduct[] = await UpdatedProduct.findByIds(productIds, { relations: ['product'] });

    if (updatedProducts.length !== 0) {
      await Promise.all(updatedProducts.map(
        (p) => ProductService.approveProductUpdate(p.product.id)
          .then((up) => productIds.push({ revision: up.revision, product: { id: up.id } })),
      ));
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
    return this.getProductsResponse({ containerId, updated: false });
  }

  /**
   * Creates a container update.
   * @param update - The container update request to progress
   */
  public static async updateContainer(update: UpdateContainerParams)
    : Promise<ContainerWithProductsResponse> {
    // Get the base container.
    const base: Container = await Container.findOne(update.id);

    // return undefined if not found.
    if (!base) {
      return undefined;
    }

    // If the ContainerRequests contain product updates we delegate them.
    const { ids, requests } = getIdsAndRequests<ProductRequest>(update.products);

    // Apply requests.
    await Promise.all(requests.map((p) => {
      if (Object.prototype.hasOwnProperty.call(p, 'id')) {
        // Push down ownership if unspecified.
        const param : UpdateProductParams = {
          ...(p as UpdateProductParams),
          ownerId: p.ownerId ?? update.ownerId,
        };
        return ProductService.updateProduct(param);
      }
      return ProductService.createProduct(p);
    }));

    let products: Product[] = [];
    await Promise.all(ids.map((id) => Product.findOne(id)))
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
    return this.getProductsResponse({ containerId: base.id, updated: true });
  }

  /**
   * Turns a ContainerResponse into a ContainerWithProductsResponse
   * @param container - The container to return
   */
  public static async getProductsResponse(container
  : { containerId: number, containerRevision?: number, updated?: boolean })
    : Promise<ContainerWithProductsResponse> {
    // Get base container
    const containerResponse: ContainerResponse = container.updated
      ? ((await this.getUpdatedContainers(
        { containerId: container.containerId },
      )).records[0])
      : ((await this.getContainers(
        { containerId: container.containerId, containerRevision: container.containerRevision },
      )).records[0]);

    const containerProducts
    : ContainerWithProductsResponse = containerResponse as ContainerWithProductsResponse;

    // Fill products
    containerProducts.products = (await ProductService.getProducts(
      {
        containerId: container.containerId,
        containerRevision: container.containerRevision,
        updatedContainer: container.updated,
      },
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
