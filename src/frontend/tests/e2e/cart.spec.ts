import { test, expect } from '@playwright/test';

const product = {
  productId: 1,
  name: 'Test Feeder',
  description: 'A feeder for testing the cart.',
  price: 12.5,
  imgName: 'feeder.png',
  sku: 'TEST-001',
  unit: 'each',
  supplierId: 1,
};

test.describe('Cart review', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/products', (route) => route.fulfill({ json: [product] }));
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: 'Test Feeder' })).toBeVisible();
    await page.getByRole('button', { name: 'Increase quantity of Test Feeder' }).click();
    await page.getByRole('button', { name: 'Increase quantity of Test Feeder' }).click();
    await page.getByRole('button', { name: 'Add 2 Test Feeder to cart' }).click();
    await page.getByRole('link', { name: 'Cart, 2 items' }).click();
  });

  test('shows item details and subtotal', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
    await expect(page.getByText('Unit price: $12.50 / each')).toBeVisible();
    await expect(page.getByLabel('Quantity of Test Feeder')).toHaveValue('2');
    await expect(page.getByText('Line total')).toBeVisible();
    await expect(page.locator('article').getByText('$25.00')).toBeVisible();
    await expect(page.getByTestId('cart-subtotal')).toHaveText('$25.00');
  });

  test('updates totals when quantity changes and shows the empty state after removal', async ({
    page,
  }) => {
    const quantity = page.getByLabel('Quantity of Test Feeder');
    await quantity.fill('');
    await expect(quantity).toHaveValue('');
    await expect(page.getByTestId('cart-subtotal')).toHaveText('$25.00');
    await quantity.fill('3');
    await expect(quantity).toHaveValue('3');
    await expect(page.locator('article').getByText('$37.50')).toBeVisible();
    await expect(page.getByTestId('cart-subtotal')).toHaveText('$37.50');

    await page.getByRole('button', { name: 'Remove Test Feeder' }).click();
    await expect(page.getByRole('status')).toContainText('Your cart is empty');
    await expect(page.getByRole('link', { name: 'Browse products' })).toBeVisible();
  });
});
