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
import { FindManyOptions } from 'typeorm';
import ProductCategory from '../entity/product/product-category';
import { ProductCategoryResponse } from '../controller/response/product-category-response';
import ProductCategoryRequest from '../controller/request/product-category-request';
import QueryFilter, { FilterMapping } from '../helpers/query-filter';

/**
 * Define productCategory filtering parameters used to filter query results.
 */
export interface ProductCategoryFilterParameters {
  /**
   * Filter based on product id.
   */
  id?: number;
  /**
   * Filter based on product owner.
   */
  name?: string;
}

/**
 * Wrapper for all Product related logic.
 */
export default class ProductCategoryService {
  /**
   * Creates a productCategoryResponse from a productCategory
   * @param {ProductCategory.model} productCategory - productCategory
   * @returns {ProductCategoryResponse.model} - a productCategoryResponse
   * created with the productCategory
   */
  private static asProductCategoryResponse(productCategory: ProductCategory)
    : ProductCategoryResponse {
    return {
      id: productCategory.id,
      name: productCategory.name,
      createdAt: productCategory.createdAt.toISOString(),
      updatedAt: productCategory.updatedAt.toISOString(),
    };
  }

  /**
   * Query for getting the productCategories.
   */
  public static async getProductCategories(params: ProductCategoryFilterParameters = {})
    : Promise<ProductCategoryResponse[]> {
    const filterMapping: FilterMapping = {
      id: 'id',
      name: 'name',
    };
    const options: FindManyOptions = {
      where: QueryFilter.createFilterWhereClause(filterMapping, params),
    };
    const productCategories = await ProductCategory.find(options);
    return productCategories.map(
      (productCategory) => (this.asProductCategoryResponse(productCategory)),
    );
  }

  /**
   * Saves a ProductCategory to the database.
   * @param request - The ProductCategoryRequest with values.
   */
  public static async postProductCategory(request: ProductCategoryRequest)
    : Promise<ProductCategoryResponse> {
    const productCategory = Object.assign(new ProductCategory(), request);
    return ProductCategory.save(productCategory)
      .then(() => this.asProductCategoryResponse(productCategory));
  }

  /**
   * Updates a ProductCategory in the database.
   * @param id - The id of the productCategory that needs to be updated.
   * @param request - The ProductCategoryRequest with updated values.
   */
  public static async patchProductCategory(id: number, request: ProductCategoryRequest)
    : Promise<ProductCategoryResponse> {
    const productCategoryToUpdate = await ProductCategory.findOne(id);
    if (!productCategoryToUpdate) {
      return null;
    }
    const productCategory = Object.assign(productCategoryToUpdate, request);
    return ProductCategory.save(productCategory)
      .then(() => this.asProductCategoryResponse(productCategory));
  }

  /**
   * Deletes a ProductCategory from the database.
   * @param id - The id of the productCategory that needs to be deleted.
   */
  public static async deleteProductCategory(id: number): Promise<ProductCategoryResponse> {
    const productCategory = await ProductCategory.findOne(id);
    if (!productCategory) {
      return null;
    }
    return ProductCategory.delete(id).then(() => this.asProductCategoryResponse(productCategory));
  }

  /**
   * Verifies whether the productCategory request translates to a valid productCategory
   * @param {ProductCategoryRequest.model} productCategoryRequest
   * - the productCategory request to verify
   * @returns {boolean} - whether productCategory is ok or not
   */
  public static async verifyProductCategory(productCategoryRequest: ProductCategoryRequest):
  Promise<boolean> {
    return productCategoryRequest.name !== ''
        && productCategoryRequest.name.length <= 64
        && !(await ProductCategory.findOne({ where: { name: productCategoryRequest.name } }));
  }
}
