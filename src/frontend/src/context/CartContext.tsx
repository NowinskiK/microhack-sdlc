import { createContext, useContext, useState, ReactNode } from 'react';

export interface CartProduct {
  productId: number;
  name: string;
  imgName: string;
  unitPrice: number;
  unit: string;
}

export interface CartItem extends CartProduct {
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (product: CartProduct, quantity: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (product: CartProduct, quantity: number) => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return;

    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.productId === product.productId);
      if (existingItem) {
        return currentItems.map((item) =>
          item.productId === product.productId
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...currentItems, { ...product, quantity }];
    });
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return;
    setItems((currentItems) =>
      currentItems.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
    );
  };

  const removeItem = (productId: number) => {
    setItems((currentItems) => currentItems.filter((item) => item.productId !== productId));
  };

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, itemCount, subtotal, addItem, updateQuantity, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
