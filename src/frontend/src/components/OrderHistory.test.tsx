import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderHistoryPage from './OrderHistory';
import { renderWithProviders } from '../test/renderWithProviders';

vi.mock('axios');
vi.mock('../api/config', () => ({
  api: {
    baseURL: 'http://api.test',
    endpoints: { branches: '/api/branches', orders: '/api/orders' },
  },
}));

const mockedGet = vi.mocked(axios.get);

const branches = [
  { branchId: 1, name: 'Downtown' },
  { branchId: 2, name: 'Uptown' },
];

const orders = [
  {
    orderId: 20,
    branchId: 1,
    orderDate: '2026-02-03',
    name: 'Newest order',
    status: 'shipped',
    lineItems: [
      { productId: 1, productName: 'Feeder', quantity: 2, unitPrice: 3.25 },
      { productId: 2, productName: 'Laser Toy', quantity: 1, unitPrice: 4.5 },
    ],
    total: 11,
  },
  {
    orderId: 10,
    branchId: 1,
    orderDate: 'not-a-date',
    name: 'Older order',
    status: 'pending',
    lineItems: [],
    total: 0,
  },
];

type Responses = Record<string, () => Promise<unknown>>;

function mockApi(responses: Responses) {
  mockedGet.mockImplementation((url: string) => {
    const handler = responses[url];
    return handler ? handler() : Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

const ok = (data: unknown) => () => Promise.resolve({ data });
const fail = () => () => Promise.reject(new Error('boom'));
const pending = () => () => new Promise(() => {});

const BRANCHES_URL = 'http://api.test/api/branches';
const ordersUrl = (branchId: number) => `http://api.test/api/orders?branchId=${branchId}`;

const branchSelect = () => screen.getByRole('combobox', { name: 'Branch' });

describe('OrderHistoryPage', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('disables the branch picker while branches load', () => {
    mockApi({ [BRANCHES_URL]: pending() });
    renderWithProviders(<OrderHistoryPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading branches…');
    expect(branchSelect()).toBeDisabled();
  });

  it('shows an error when branches fail to load', async () => {
    mockApi({ [BRANCHES_URL]: fail() });
    renderWithProviders(<OrderHistoryPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load branches');
    expect(branchSelect()).toBeDisabled();
  });

  it('shows a message and keeps the picker disabled when there are no branches', async () => {
    mockApi({ [BRANCHES_URL]: ok([]) });
    renderWithProviders(<OrderHistoryPage />);

    expect(await screen.findByText('No branches are available to select.')).toBeInTheDocument();
    expect(branchSelect()).toBeDisabled();
  });

  it('does not request orders until a branch is selected', async () => {
    mockApi({ [BRANCHES_URL]: ok(branches) });
    renderWithProviders(<OrderHistoryPage />);

    await waitFor(() => expect(branchSelect()).toBeEnabled());

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith(BRANCHES_URL);
  });

  it('loads the selected branch history and shows the newest order by default', async () => {
    const user = userEvent.setup();
    mockApi({ [BRANCHES_URL]: ok(branches), [ordersUrl(1)]: ok(orders) });
    renderWithProviders(<OrderHistoryPage />);
    await waitFor(() => expect(branchSelect()).toBeEnabled());

    await user.selectOptions(branchSelect(), 'Downtown');

    const details = await screen.findByRole('region', { name: 'Details for Newest order' });
    expect(mockedGet).toHaveBeenCalledWith(ordersUrl(1));
    expect(screen.getByRole('button', { name: /Newest order/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(details).getByText('Feb 3, 2026')).toBeInTheDocument();
    expect(within(details).getByText('Feeder')).toBeInTheDocument();
    expect(within(details).getByText('$3.25 each')).toBeInTheDocument();
    expect(within(details).getByText('Total: $11.00')).toBeInTheDocument();
  });

  it('switches details when another order is selected, including orders without items', async () => {
    const user = userEvent.setup();
    mockApi({ [BRANCHES_URL]: ok(branches), [ordersUrl(1)]: ok(orders) });
    renderWithProviders(<OrderHistoryPage />);
    await waitFor(() => expect(branchSelect()).toBeEnabled());
    await user.selectOptions(branchSelect(), 'Downtown');

    await user.click(await screen.findByRole('button', { name: /Older order/ }));

    const details = screen.getByRole('region', { name: 'Details for Older order' });
    expect(within(details).getByText('No items were recorded for this order.')).toBeInTheDocument();
    expect(within(details).getByText('Total: $0.00')).toBeInTheDocument();
    // Unparseable dates are shown verbatim rather than as "Invalid Date".
    expect(within(details).getByText('not-a-date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Newest order/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('resets the selected order when switching branches', async () => {
    const user = userEvent.setup();
    const uptownOrders = [{ ...orders[0], orderId: 30, branchId: 2, name: 'Uptown order' }];
    mockApi({
      [BRANCHES_URL]: ok(branches),
      [ordersUrl(1)]: ok(orders),
      [ordersUrl(2)]: ok(uptownOrders),
    });
    renderWithProviders(<OrderHistoryPage />);
    await waitFor(() => expect(branchSelect()).toBeEnabled());
    await user.selectOptions(branchSelect(), 'Downtown');
    await user.click(await screen.findByRole('button', { name: /Older order/ }));

    await user.selectOptions(branchSelect(), 'Uptown');

    expect(
      await screen.findByRole('region', { name: 'Details for Uptown order' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Older order')).not.toBeInTheDocument();
  });

  it('shows an empty state when the branch has no orders', async () => {
    const user = userEvent.setup();
    mockApi({ [BRANCHES_URL]: ok(branches), [ordersUrl(2)]: ok([]) });
    renderWithProviders(<OrderHistoryPage />);
    await waitFor(() => expect(branchSelect()).toBeEnabled());

    await user.selectOptions(branchSelect(), 'Uptown');

    expect(await screen.findByRole('status')).toHaveTextContent('No orders found');
  });

  it('shows loading and then an error when order history fails', async () => {
    const user = userEvent.setup();
    let rejectOrders: (reason: Error) => void = () => {};
    mockApi({
      [BRANCHES_URL]: ok(branches),
      [ordersUrl(1)]: () => new Promise((_, reject) => (rejectOrders = reject)),
    });
    renderWithProviders(<OrderHistoryPage />);
    await waitFor(() => expect(branchSelect()).toBeEnabled());

    await user.selectOptions(branchSelect(), 'Downtown');
    expect(await screen.findByText('Loading order history…')).toBeInTheDocument();

    rejectOrders(new Error('boom'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load order history');
    expect(screen.queryByText('Loading order history…')).not.toBeInTheDocument();
  });
});
