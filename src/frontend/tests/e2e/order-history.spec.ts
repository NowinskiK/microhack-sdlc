import { test, expect } from '@playwright/test';

const branches = [
  { branchId: 10, name: 'North Branch' },
  { branchId: 11, name: 'South Branch' },
];

const orders = [
  {
    orderId: 101,
    branchId: 10,
    orderDate: '2026-10-25',
    name: 'Cat supplies',
    status: 'shipped',
    lineItems: [
      { productId: 1, productName: 'Smart Feeder', quantity: 2, unitPrice: 12.5 },
      { productId: 2, productName: 'Water Fountain', quantity: 1, unitPrice: 1.5 },
    ],
    total: 26.5,
  },
];

test.describe('Order history', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/branches', (route) => route.fulfill({ json: branches }));
  });

  test('selects a branch and displays order details and total', async ({ page }) => {
    await page.route('**/api/orders*', (route) => {
      const branchId = new URL(route.request().url()).searchParams.get('branchId');
      return route.fulfill({ json: branchId === '10' ? orders : [] });
    });

    await page.goto('/');
    await page.getByRole('link', { name: 'Order history' }).click();
    await expect(page).toHaveURL(/\/order-history/);
    await page.getByLabel('Branch').selectOption('10');

    await expect(page.getByRole('button', { name: /Cat supplies/ })).toContainText('shipped');
    await expect(page.getByRole('button', { name: /Cat supplies/ })).toContainText('Oct 25, 2026');
    await expect(page.getByRole('button', { name: /Cat supplies/ })).toContainText('$26.50');
    await expect(page.getByRole('region', { name: 'Details for Cat supplies' })).toContainText(
      'Smart Feeder',
    );
    await expect(page.getByRole('region', { name: 'Details for Cat supplies' })).toContainText(
      '× 2',
    );
    await expect(page.getByRole('region', { name: 'Details for Cat supplies' })).toContainText(
      '$12.50 each',
    );
    await expect(page.getByRole('region', { name: 'Details for Cat supplies' })).toContainText(
      'Total: $26.50',
    );
  });

  test('shows an empty state for a branch without orders', async ({ page }) => {
    await page.route('**/api/orders*', (route) => route.fulfill({ json: [] }));

    await page.goto('/order-history');
    await page.getByLabel('Branch').selectOption('11');

    await expect(page.getByRole('status')).toContainText('No orders found');
  });

  test('shows loading and request error states', async ({ page }) => {
    await page.route('**/api/orders*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ json: orders });
    });

    await page.goto('/order-history');
    await page.getByLabel('Branch').selectOption('10');
    await expect(page.getByRole('status')).toContainText('Loading order history');
    await expect(page.getByRole('button', { name: /Cat supplies/ })).toBeVisible();

    await page.unroute('**/api/orders*');
    await page.route('**/api/orders*', (route) => route.abort());
    await page.getByLabel('Branch').selectOption('11');
    await expect(page.getByRole('alert')).toContainText('Could not load order history');
  });
});
