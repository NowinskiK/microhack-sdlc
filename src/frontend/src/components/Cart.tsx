import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function Cart() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();
  const { darkMode } = useTheme();
  const textColor = darkMode ? 'text-light' : 'text-gray-800';
  const mutedTextColor = darkMode ? 'text-gray-400' : 'text-gray-600';
  const surfaceColor = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <section
      className={`min-h-screen ${darkMode ? 'bg-dark' : 'bg-gray-100'} px-4 pb-16 pt-24 transition-colors duration-300`}
    >
      <div className="mx-auto max-w-5xl">
        <h1 className={`mb-8 text-3xl font-bold ${textColor}`}>Your cart</h1>

        {items.length === 0 ? (
          <div
            className={`${surfaceColor} rounded-lg border px-6 py-16 text-center shadow-sm`}
            role="status"
          >
            <h2 className={`text-xl font-semibold ${textColor}`}>Your cart is empty</h2>
            <p className={`${mutedTextColor} mt-2`}>Find something your cat will love.</p>
            <Link
              to="/products"
              className="mt-6 inline-flex rounded-lg bg-primary px-5 py-3 font-medium text-white transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
            <div className="space-y-4">
              {items.map((item) => (
                <article
                  key={item.productId}
                  className={`${surfaceColor} grid grid-cols-[5rem_1fr] gap-4 rounded-lg border p-4 sm:grid-cols-[6rem_1fr_auto] sm:items-center`}
                >
                  <img
                    src={`/${item.imgName}`}
                    alt=""
                    className="h-20 w-20 object-contain sm:h-24 sm:w-24"
                  />
                  <div className="min-w-0">
                    <h2 className={`truncate text-lg font-semibold ${textColor}`}>{item.name}</h2>
                    <p className={`${mutedTextColor} mt-1 text-sm`}>
                      Unit price: {formatCurrency(item.unitPrice)}{item.unit ? ` / ${item.unit}` : ''}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <label
                        htmlFor={`cart-quantity-${item.productId}`}
                        className={mutedTextColor}
                      >
                        Quantity
                      </label>
                      <input
                        id={`cart-quantity-${item.productId}`}
                        aria-label={`Quantity of ${item.name}`}
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(event) => {
                          const quantity = Number(event.target.value);
                          if (Number.isSafeInteger(quantity) && quantity > 0) {
                            updateQuantity(item.productId, quantity);
                          }
                        }}
                        className={`${darkMode ? 'border-gray-600 bg-gray-900 text-light' : 'border-gray-300 bg-white text-gray-800'} w-20 rounded border px-2 py-1 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="mt-3 text-sm font-medium text-red-600 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      Remove
                      <span className="sr-only"> {item.name}</span>
                    </button>
                  </div>
                  <div className="col-span-2 flex items-center justify-between border-t border-gray-200 pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
                    <p className={`font-semibold ${textColor}`}>
                      <span className={`mb-1 block text-xs font-normal ${mutedTextColor}`}>
                        Line total
                      </span>
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <aside className={`${surfaceColor} h-fit rounded-lg border p-5`}>
              <h2 className={`text-lg font-semibold ${textColor}`}>Order summary</h2>
              <div className={`mt-4 flex justify-between border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} pt-4`}>
                <span className={mutedTextColor}>Subtotal</span>
                <span className={`font-bold ${textColor}`} data-testid="cart-subtotal">
                  {formatCurrency(subtotal)}
                </span>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
