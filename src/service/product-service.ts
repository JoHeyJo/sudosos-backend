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
import dinero from 'dinero.js';
import { ProductResponse } from '../controller/response/product-response';
import Product from '../entity/product/product';
import ProductRevision from '../entity/product/product-revision';
import UpdatedProduct from '../entity/product/updated-product';
import DineroTransformer from '../entity/transformer/dinero-transformer';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';
import ContainerRevision from '../entity/container/container-revision';
import Container from '../entity/container/container';
import UpdatedContainer from '../entity/container/updated-container';
import User from '../entity/user/user';
import ProductRequest from '../controller/request/product-request';
import ProductCategory from '../entity/product/product-category';
import PointOfSale from '../entity/point-of-sale/point-of-sale';
import PointOfSaleRevision from '../entity/point-of-sale/point-of-sale-revision';

/**
 * Define product filtering parameters used to filter query results.
 */
export interface ProductParameters {
  /**
   * Filter based on product id.
   */
  productId?: number;
  /**
   * Filter based on product revision.
   */
  productRevision?: number;
  /**
   * Filter based on product owner.
   */
  ownerId?: number;
  /**
   * Filter based on container id.
   */
  containerId?: number;
  /**
   * Filter based on a specific container revision.
   */
  containerRevision?: number;
  /**
   * Filter based on if the updated container should be used.
   */
  updatedContainer?: boolean;
  /**
   * Filter based on point of sale id.
   */
  pointOfSaleId?: number;
  /**
   * Filter based on a specific point of sale revision.
   */
  pointOfSaleRevision?: number;
  /**
   * Filter based on if the updated point of sale should be used.
   */
  updatedPointOfSale?: boolean;
}

/**
 * Wrapper for all Product related logic.
 */
export default class ProductService {
  /**
   * Helper function for the base mapping the raw getMany response product.
   * @param rawProduct - the raw response to parse.
   */
  public static asProductResponse(rawProduct: any): ProductResponse {
    return {
      id: rawProduct.id,
      revision: rawProduct.revision,
      alcoholPercentage: rawProduct.alcoholpercentage,
      category: {
        id: rawProduct.category_id,
        name: rawProduct.category_name,
      },
      createdAt: rawProduct.createdAt,
      owner: {
        id: rawProduct.owner_id,
        firstName: rawProduct.owner_firstName,
        lastName: rawProduct.owner_lastName,
      },
      image: rawProduct.image,
      name: rawProduct.name,
      price: DineroTransformer.Instance.from(rawProduct.price).toObject(),
    };
  }

  /**
   * Filter the products on container ID.
   * @param builder - The query builder being used.
   * @param containerId - The ID of the container.
   * @param isUpdatedProduct - If we are getting updated products.
   * @param isUpdatedContainer - If the container is an updated container.
   * @param containerRevision - If we are getting a specific container revision.
   * @private
   */
  private static addContainerFilter(
    builder: SelectQueryBuilder<Product>,
    containerId?: number,
    isUpdatedProduct?: boolean,
    isUpdatedContainer?: boolean,
    containerRevision?: number,
  ): void {
    // Case distinction for the inner join condition.
    function condition() {
      if (isUpdatedProduct) return 'updatedproduct.product = containerproducts.productId';
      if (isUpdatedContainer) {
        return 'productrevision.product = containerproducts.productId';
      }
      return 'productrevision.product = containerproducts.productId AND productrevision.revision = containerproducts.productRevision';
    }

    // Case distinction for the inner join.
    function innerJoin() {
      if (isUpdatedContainer) return 'container.id = containeralias.containerId';
      if (containerRevision) {
        return `container.id = containeralias.containerId AND ${containerRevision} = containeralias.revision`;
      }
      return 'container.id = containeralias.containerId AND container.currentRevision = containeralias.revision';
    }

    // Filter on products in the container.
    builder
      .innerJoinAndSelect((qb) => {
        qb
          .from(Container, 'container')
          .innerJoinAndSelect(
            isUpdatedContainer ? UpdatedContainer : ContainerRevision,
            'containeralias',
            innerJoin(),
          )
          .innerJoinAndSelect('containeralias.products', 'product')
          .select(isUpdatedContainer
            ? ['productId']
            : ['product.productId AS productId', 'product.revision as productRevision']);
        if (containerId) qb.where('container.id = :id', { id: containerId });
        return qb;
      }, 'containerproducts', condition());
  }

  /**
   * Gets all the products in a PointOfSale
   * @param params
   */
  public static async getProductsPOS(params: ProductParameters = {}):
  Promise<ProductResponse[]> {
    let POScurrent: PointOfSale;
    let revision = params.pointOfSaleRevision;

    if (!params.pointOfSaleRevision) {
      POScurrent = await PointOfSale.findOne({ id: params.pointOfSaleId });
      if (!POScurrent) return;
      revision = POScurrent.currentRevision;
    }
    const id = params.pointOfSaleId;

    const builder = createQueryBuilder()
      .from(PointOfSale, 'pos')
      .innerJoinAndSelect(PointOfSaleRevision, 'posalias', `pos.id = posalias.pointOfSaleId AND pos.id = ${id} AND posalias.revision = ${revision}`)
      .innerJoinAndSelect('posalias.containers', 'containers')
      .innerJoinAndSelect('containers.products', 'products')
      .groupBy('products.productId, products.revision');

    builder
      .innerJoinAndSelect(Product, 'baseproduct', 'products.productId = baseproduct.id')
      .innerJoinAndSelect('baseproduct.owner', 'owner')
      .innerJoinAndSelect('products.category', 'category')
      .innerJoinAndSelect('baseproduct.image', 'image')
      .select([
        'baseproduct.id AS id',
        'baseproduct.createdAt AS createdAt',
        'products.updatedAt AS updatedAt',
        'products.name AS name',
        'products.price AS price',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
        'category.id AS category_id',
        'category.name AS category_name',
        'image.downloadName AS image',
        'products.revision as revision',
        'products.alcoholpercentage AS alcoholpercentage',
      ]);

    const rawProducts = await builder.getRawMany();

    // eslint-disable-next-line consistent-return
    return rawProducts.map((rawProduct: any) => this.asProductResponse(rawProduct));
  }

  /**
   * Query for getting all products following the ProductParameters.
   * @param params - The product query parameters.
   */
  public static async getProducts(params: ProductParameters = {})
    : Promise<ProductResponse[]> {
    function condition() {
      // No revision defaults to latest revision.
      const latest = params.productRevision ? params.productRevision : 'product.currentRevision';
      // If we are getting updatedContainers or products,
      // we only want the last revision, otherwise all revisions.
      // This is needed since containers can contain older revisions,
      // Whilst updatedContainer contain the oldest revisions.
      return params.updatedContainer || !params.containerId
        ? `product.id = productrevision.product AND ${latest} = productrevision.revision`
        : 'product.id = productrevision.product';
    }

    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        ProductRevision,
        'productrevision',
        condition(),
      );

    if (params.containerId) {
      this.addContainerFilter(builder, params.containerId, false,
        params.updatedContainer, params.containerRevision);
    }

    builder
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('productrevision.category', 'category')
      .leftJoinAndSelect('product.image', 'image')
      .select([
        'product.id AS id',
        'productrevision.revision as revision',
        'product.createdAt AS createdAt',
        'productrevision.updatedAt AS updatedAt',
        'productrevision.name AS name',
        'productrevision.price AS price',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
        'category.id AS category_id',
        'category.name AS category_name',
        'productrevision.alcoholpercentage AS alcoholpercentage',
        'image.downloadName as image',
      ]);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
      ownerId: 'owner.id',
    };

    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();
    return rawProducts.map((rawProduct: any) => this.asProductResponse(rawProduct));
  }

  /**
   * Query for getting all updated products following the ProductParameters.
   * @param params - The product query parameters.
   */
  public static async getUpdatedProducts(params: ProductParameters = {})
    : Promise<ProductResponse[]> {
    const builder = createQueryBuilder()
      .from(Product, 'product')
      .innerJoinAndSelect(
        UpdatedProduct,
        'updatedproduct',
        'product.id = updatedproduct.product',
      );

    if (params.containerId || params.pointOfSaleId) {
      this.addContainerFilter(builder, params.containerId, true, params.updatedContainer);
    }

    builder
      .innerJoinAndSelect('product.owner', 'owner')
      .innerJoinAndSelect('updatedproduct.category', 'category')
      .leftJoinAndSelect('product.image', 'image')
      .select([
        'product.id AS id',
        'product.createdAt AS createdAt',
        'updatedproduct.updatedAt AS updatedAt',
        'updatedproduct.name AS name',
        'updatedproduct.price AS price',
        'owner.id AS owner_id',
        'owner.firstName AS owner_firstName',
        'owner.lastName AS owner_lastName',
        'category.id AS category_id',
        'category.name AS category_name',
        'updatedproduct.alcoholpercentage AS alcoholpercentage',
        'image.downloadName as image',
      ]);

    const filterMapping: FilterMapping = {
      productId: 'product.id',
    };

    QueryFilter.applyFilter(builder, filterMapping, params);

    const rawProducts = await builder.getRawMany();
    return rawProducts.map((rawProduct: any) => this.asProductResponse(rawProduct));
  }

  /**
   * Function that returns all the products based on parameters.
   * This is used for POS or containers which are not solely
   * the latest revision products.
   * @param params - The product parameters to adhere to.
   */
  public static async getAllProducts(params: ProductParameters = {}) {
    // We get the products by first getting the updated products and then merge them with the
    // normal products.
    const updatedProducts: ProductResponse[] = await this.getUpdatedProducts(params);

    const updatedProductIds = updatedProducts.map((prod) => prod.id);

    // Get the remaining products.
    const products: ProductResponse[] = (await this.getProducts(params));

    const filteredProducts = products.filter(
      (prod) => !updatedProductIds.includes(prod.id),
    );

    // Return the products.
    return filteredProducts.concat(updatedProducts);
  }

  /**
   * Creates a product update.
   * @param productId - The ID of the product to update.
   * @param update - The product variables.
   */
  public static async updateProduct(productId: number, update: ProductRequest)
    : Promise<ProductResponse> {
    // Get the base product.
    const base: Product = await Product.findOne(productId);

    // return undefined if not found or request is invalid
    if (!base) {
      return undefined;
    }

    // Set base product, then the oldest settings and then the newest.
    const updatedProduct = Object.assign(new UpdatedProduct(), {
      product: base,
      ...update,
      // Price number into dinero.
      price: dinero({
        amount: update.price,
      }),
    });

    // Save the product.
    await updatedProduct.save();

    // Pull the just created product from the database to fix the formatting.
    return (await this.getUpdatedProducts({ productId }))[0];
  }

  /**
   * Creates a new product.
   *
   * The newly created product resides in the Product table and has no revision,
   * but it does have an updated product.
   * To confirm the product the updated product has to be confirmed and a revision will be created.
   *
   * @param owner - The user that created the product.
   * @param product - The product to be created.
   */
  public static async createProduct(owner: User, product: ProductRequest)
    : Promise<ProductResponse> {
    const base = Object.assign(new Product(), {
      owner,
    });

    // Save the product.
    await base.save();

    // Set base product, then the oldest settings and then the newest.
    const updatedProduct = Object.assign(new UpdatedProduct(), {
      product: await Product.findOne(base.id),
      ...product,
      // Price number into dinero.
      price: DineroTransformer.Instance.from(product.price),
    });

    await updatedProduct.save();

    return (await this.getUpdatedProducts({ productId: base.id }))[0];
  }

  /**
   * Confirms an product update and creates a product revision.
   * @param productId - The product update to confirm.
   */
  public static async approveProductUpdate(productId: number)
    : Promise<ProductResponse> {
    const base: Product = await Product.findOne(productId);
    const rawUpdateProduct = await UpdatedProduct.findOne(productId);

    // return undefined if not found or request is invalid
    if (!base || !rawUpdateProduct) {
      return undefined;
    }

    const update: ProductResponse = (await this.getUpdatedProducts({ productId }))[0];

    // Set base product, then the oldest settings and then the newest.
    const productRevision: ProductRevision = Object.assign(new ProductRevision(), {
      product: base,
      // Apply the update.
      ...update,
      // Increment revision.
      revision: base.currentRevision ? base.currentRevision + 1 : 1,
      // Fix dinero
      price: DineroTransformer.Instance.from(update.price.amount),
    });

    // First save the revision.
    await ProductRevision.save(productRevision);
    // Increment current revision.
    base.currentRevision = base.currentRevision ? base.currentRevision + 1 : 1;
    await base.save();

    // Remove update after revision is created.
    await UpdatedProduct.delete(productId);

    // Return the new product.
    return (await this.getProducts({ productId }))[0];
  }

  /**
   * Verifies whether the product request translates to a valid product
   * @param {ProductRequest.model} productRequest - the product request to verify
   * @returns {boolean} - whether product is ok or not
   */
  public static async verifyProduct(productRequest: ProductRequest): Promise<boolean> {
    return productRequest.price >= 0
        && productRequest.name !== ''
        && await ProductCategory.findOne(productRequest.category)
        && productRequest.alcoholPercentage >= 0;
  }
}
