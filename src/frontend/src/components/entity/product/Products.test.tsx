import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Products from './Products';
import { useCart } from '../../../context/CartContext';
import { renderWithProviders } from '../../../test/renderWithProviders';

vi.mock('axios');
vi.mock('../../../api/config', () => ({
  api: { baseURL: 'http://api.test', endpoints: { products: '/api/products' } },
}));

const mockedGet = vi.mocked(axios.get);

const products = [
  {
    productId: 1,
    name: 'Test Feeder',
    description: 'Feeds cats',
    price: 20,
    imgName: 'feeder.png',
    sku: 'F-1',
    unit: 'each',
    supplierId: 1,
  },
  {
    productId: 2,
    name: 'Sale Toy',
    description: 'Discounted toy',
    price: 10,
    imgName: 'toy.png',
    sku: 'T-1',
    unit: 'box',
    supplierId: 1,
    discount: 0.25,
  },
];

function CartProbe() {
  const { items, itemCount, subtotal } = useCart();
  return (
    <output data-testid="cart-probe">
      {JSON.stringify({ items: items.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })), itemCount, subtotal })}
    </output>
  );
}

const readCart = () => JSON.parse(screen.getByTestId('cart-probe').textContent ?? '{}');

async function renderProducts() {
  renderWithProviders(
    <>
      <Products />
      <CartProbe />
    </>,
  );
  await screen.findByRole('heading', { name: 'Test Feeder' });
}

describe('Products add-to-cart', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ data: products });
  });

  it('disables Add to Cart until a quantity is selected', async () => {
    await renderProducts();

    expect(screen.getByRole('button', { name: 'Add 0 Test Feeder to cart' })).toBeDisabled();
  });

  it('never lets the picker quantity go below zero', async () => {
    const user = userEvent.setup();
    await renderProducts();

    await user.click(screen.getByRole('button', { name: 'Decrease quantity of Test Feeder' }));

    expect(screen.getByLabelText('Quantity of Test Feeder')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Add 0 Test Feeder to cart' })).toBeDisabled();
  });

  it('adds the selected quantity to the cart and resets the picker', async () => {
    const user = userEvent.setup();
    await renderProducts();
    const increase = screen.getByRole('button', { name: 'Increase quantity of Test Feeder' });

    await user.click(increase);
    await user.click(increase);
    await user.click(screen.getByRole('button', { name: 'Add 2 Test Feeder to cart' }));

    expect(readCart()).toEqual({
      items: [{ productId: 1, quantity: 2, unitPrice: 20 }],
      itemCount: 2,
      subtotal: 40,
    });
    expect(screen.getByLabelText('Quantity of Test Feeder')).toHaveTextContent('0');
  });

  it('accumulates quantity when the same product is added twice', async () => {
    const user = userEvent.setup();
    await renderProducts();
    const increase = screen.getByRole('button', { name: 'Increase quantity of Test Feeder' });

    await user.click(increase);
    await user.click(screen.getByRole('button', { name: 'Add 1 Test Feeder to cart' }));
    await user.click(increase);
    await user.click(increase);
    await user.click(screen.getByRole('button', { name: 'Add 2 Test Feeder to cart' }));

    expect(readCart().items).toEqual([{ productId: 1, quantity: 3, unitPrice: 20 }]);
  });

  it('stores the discounted unit price for discounted products', async () => {
    const user = userEvent.setup();
    await renderProducts();

    await user.click(screen.getByRole('button', { name: 'Increase quantity of Sale Toy' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 Sale Toy to cart' }));

    expect(readCart()).toMatchObject({
      items: [{ productId: 2, quantity: 1, unitPrice: 7.5 }],
      subtotal: 7.5,
    });
  });

  it('shows an error message when products fail to load', async () => {
    mockedGet.mockRejectedValue(new Error('boom'));
    renderWithProviders(<Products />);

    expect(await screen.findByText('Failed to fetch products')).toBeInTheDocument();
  });
});
