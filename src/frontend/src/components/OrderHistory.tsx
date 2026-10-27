import { useState } from 'react';
import axios from 'axios';
import { useQuery } from 'react-query';
import { api } from '../api/config';
import { useTheme } from '../context/ThemeContext';

interface Branch {
  branchId: number;
  name: string;
}

interface OrderHistoryLineItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface OrderHistory {
  orderId: number;
  branchId: number;
  orderDate: string;
  name: string;
  status: string;
  lineItems: OrderHistoryLineItem[];
  total: number;
}

const fetchBranches = async (): Promise<Branch[]> => {
  const { data } = await axios.get(`${api.baseURL}${api.endpoints.branches}`);
  return data;
};

const fetchOrderHistory = async (branchId: string): Promise<OrderHistory[]> => {
  const { data } = await axios.get(
    `${api.baseURL}${api.endpoints.orders}?branchId=${encodeURIComponent(branchId)}`,
  );
  return data;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
};

export default function OrderHistoryPage() {
  const { darkMode } = useTheme();
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const {
    data: branches,
    isLoading: branchesLoading,
    error: branchesError,
  } = useQuery<Branch[]>('branches', fetchBranches);
  const {
    data: orders,
    isLoading: ordersLoading,
    error: ordersError,
  } = useQuery<OrderHistory[]>(
    ['orderHistory', selectedBranchId],
    () => fetchOrderHistory(selectedBranchId),
    { enabled: selectedBranchId !== '' },
  );
  const selectedOrder = orders?.find((order) => order.orderId === selectedOrderId) ?? orders?.[0];
  const textColor = darkMode ? 'text-light' : 'text-gray-800';
  const mutedTextColor = darkMode ? 'text-gray-400' : 'text-gray-600';
  const surfaceColor = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <section
      className={`min-h-screen ${darkMode ? 'bg-dark' : 'bg-gray-100'} px-4 pb-16 pt-24 transition-colors duration-300`}
    >
      <div className="mx-auto max-w-5xl">
        <h1 className={`mb-6 text-3xl font-bold ${textColor}`}>Order history</h1>
        <div className="mb-8 max-w-md">
          <label htmlFor="order-history-branch" className={`mb-2 block font-medium ${textColor}`}>
            Branch
          </label>
          <select
            id="order-history-branch"
            value={selectedBranchId}
            onChange={(event) => {
              setSelectedBranchId(event.target.value);
              setSelectedOrderId(null);
            }}
            disabled={branchesLoading || !branches?.length}
            className={`${surfaceColor} w-full rounded-lg border px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`}
          >
            <option value="">Select a branch</option>
            {branches?.map((branch) => (
              <option key={branch.branchId} value={branch.branchId}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        {branchesLoading && <p role="status">Loading branches…</p>}
        {branchesError != null && (
          <p role="alert">Could not load branches. Please try again.</p>
        )}
        {branches && branches.length === 0 && (
          <p role="status">No branches are available to select.</p>
        )}
        {selectedBranchId && ordersLoading && <p role="status">Loading order history…</p>}
        {selectedBranchId && ordersError != null && (
          <p role="alert">Could not load order history. Please try again.</p>
        )}
        {orders && orders.length === 0 && (
          <div className={`${surfaceColor} rounded-lg border px-6 py-12 text-center`} role="status">
            <h2 className={`text-xl font-semibold ${textColor}`}>No orders found</h2>
            <p className={`${mutedTextColor} mt-2`}>This branch has no past orders.</p>
          </div>
        )}
        {orders && orders.length > 0 && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <section aria-label="Orders">
              <h2 className={`mb-3 text-xl font-semibold ${textColor}`}>Orders</h2>
              <ul className="space-y-3">
                {orders.map((order) => (
                  <li key={order.orderId}>
                    <button
                      type="button"
                      aria-pressed={selectedOrder?.orderId === order.orderId}
                      onClick={() => setSelectedOrderId(order.orderId)}
                      className={`${surfaceColor} w-full rounded-lg border p-4 text-left shadow-sm transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary`}
                    >
                      <span className={`block font-semibold ${textColor}`}>{order.name}</span>
                      <span className={`mt-1 block text-sm ${mutedTextColor}`}>
                        <time dateTime={order.orderDate}>{formatDate(order.orderDate)}</time>
                        {' · '}
                        {order.status}
                      </span>
                      <span className={`mt-2 block font-medium ${textColor}`}>
                        {formatCurrency(order.total)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {selectedOrder && (
              <section
                className={`${surfaceColor} h-fit rounded-lg border p-5`}
                aria-label={`Details for ${selectedOrder.name}`}
              >
                <h2 className={`text-xl font-semibold ${textColor}`}>{selectedOrder.name}</h2>
                <p className={`mt-1 ${mutedTextColor}`}>
                  <time dateTime={selectedOrder.orderDate}>{formatDate(selectedOrder.orderDate)}</time>
                  {' · '}
                  {selectedOrder.status}
                </p>
                <h3 className={`mb-3 mt-6 font-semibold ${textColor}`}>Items</h3>
                {selectedOrder.lineItems.length > 0 ? (
                  <ul className="divide-y divide-gray-200">
                    {selectedOrder.lineItems.map((item, index) => (
                      <li
                        key={`${item.productId}-${index}`}
                        className={`flex justify-between gap-4 py-3 ${textColor}`}
                      >
                        <span>
                          {item.productName}
                          <span className={`ml-2 text-sm ${mutedTextColor}`}>
                            × {item.quantity}
                          </span>
                        </span>
                        <span className="whitespace-nowrap">{formatCurrency(item.unitPrice)} each</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={mutedTextColor}>No items were recorded for this order.</p>
                )}
                <p className={`mt-4 border-t border-gray-200 pt-4 text-right font-bold ${textColor}`}>
                  Total: {formatCurrency(selectedOrder.total)}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
