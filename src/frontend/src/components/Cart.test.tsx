import { useEffect } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Cart from './Cart';
import { CartProduct, useCart } from '../context/CartContext';
import { renderWithProviders } from '../test/renderWithProviders';

type SeedItem = CartProduct & { quantity: number };

const feeder: SeedItem = {
  productId: 1,
  name: 'Test Feeder',
  imgName: 'feeder.png',
  unitPrice: 12.5,
  unit: 'each',
  quantity: 2,
};
const toy: SeedItem = {
  productId: 2,
  name: 'Laser Toy',
  imgName: 'toy.png',
  unitPrice: 4,
  unit: '',
  quantity: 1,
};

function SeededCart({ items }: { items: SeedItem[] }) {
  const { addItem } = useCart();
  useEffect(() => {
    items.forEach(({ quantity, ...product }) => addItem(product, quantity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Cart />;
}

const renderCart = (items: SeedItem[]) => renderWithProviders(<SeededCart items={items} />);

describe('Cart', () => {
  it('shows an empty state with a link back to products', () => {
    renderCart([]);

    expect(screen.getByRole('status')).toHaveTextContent('Your cart is empty');
    expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(screen.queryByTestId('cart-subtotal')).not.toBeInTheDocument();
  });

  it('renders each line item with unit price, line total and the subtotal', () => {
    renderCart([feeder, toy]);

    const [feederRow, toyRow] = screen.getAllByRole('article');
    expect(within(feederRow).getByRole('heading', { name: 'Test Feeder' })).toBeInTheDocument();
    expect(within(feederRow).getByText('Unit price: $12.50 / each')).toBeInTheDocument();
    expect(within(feederRow).getByText('$25.00')).toBeInTheDocument();
    expect(within(feederRow).getByLabelText('Quantity of Test Feeder')).toHaveValue(2);

    // Products without a unit should not render a dangling " / ".
    expect(within(toyRow).getByText('Unit price: $4.00')).toBeInTheDocument();

    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$29.00');
  });

  it('updates line total and subtotal when a valid quantity is entered', async () => {
    const user = userEvent.setup();
    renderCart([feeder, toy]);
    const quantity = screen.getByLabelText('Quantity of Test Feeder');

    await user.clear(quantity);
    await user.type(quantity, '3');

    expect(quantity).toHaveValue(3);
    expect(within(screen.getAllByRole('article')[0]).getByText('$37.50')).toBeInTheDocument();
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$41.50');
  });

  it.each([
    ['empty', ''],
    ['zero', '0'],
    ['a decimal', '2.5'],
  ])('keeps the previous quantity when the input is %s', async (_label, value) => {
    const user = userEvent.setup();
    renderCart([feeder]);
    const quantity = screen.getByLabelText('Quantity of Test Feeder');

    await user.clear(quantity);
    if (value) {
      await user.paste(value);
    }

    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$25.00');
  });

  it('commits only the last whole-number prefix when a decimal is typed key by key', async () => {
    const user = userEvent.setup();
    renderCart([feeder]);
    const quantity = screen.getByLabelText('Quantity of Test Feeder');

    await user.clear(quantity);
    await user.type(quantity, '1');
    // Valid whole numbers are committed on each keystroke.
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$12.50');

    await user.type(quantity, '.5');
    // The fractional draft is never committed, so the cart keeps the last whole quantity.
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$12.50');
    expect(within(screen.getByRole('article')).getByText('$12.50')).toBeInTheDocument();

    await user.tab();

    // On blur the input re-syncs to the committed cart quantity instead of showing 1.5.
    expect(quantity).toHaveValue(1);
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$12.50');
  });

  it('restores the committed quantity when an invalid draft loses focus', async () => {
    const user = userEvent.setup();
    renderCart([feeder]);
    const quantity = screen.getByLabelText('Quantity of Test Feeder');

    await user.clear(quantity);
    await user.type(quantity, '0');
    expect(quantity).toHaveValue(0);

    await user.tab();

    expect(quantity).toHaveValue(2);
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$25.00');
  });

  it('removes only the selected item and shows the empty state after the last removal', async () => {
    const user = userEvent.setup();
    renderCart([feeder, toy]);

    await user.click(screen.getByRole('button', { name: 'Remove Test Feeder' }));

    expect(screen.queryByText('Test Feeder')).not.toBeInTheDocument();
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent('$4.00');

    await user.click(screen.getByRole('button', { name: 'Remove Laser Toy' }));

    expect(screen.getByRole('status')).toHaveTextContent('Your cart is empty');
  });
});
