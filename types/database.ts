export type UserRole = "org_user" | "admin" | "courier" | "customer";

export type OrgType = "restaurant" | "store" | "pharmacy" | "warehouse";

// Roles allowed to access merchant pages
export const MERCHANT_ALLOWED_ROLES: UserRole[] = ["org_user", "admin"];

export const ORG_TYPE_OPTIONS: { value: OrgType; label: string }[] = [
  { value: "restaurant", label: "Restaurant" },
  { value: "store", label: "Store" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "warehouse", label: "Warehouse" },
];

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
  org_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  org_id: string;
  name: string;
  price: number;
  unit: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthFormData {
  email: string;
  password: string;
  confirmPassword?: string;
  fullName?: string;
  rememberMe?: boolean;
}

export interface AuthError {
  message: string;
  code?: string;
}

// Delivery Task Types
export type TaskStatus =
  | "draft"
  | "created"
  | "published"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "canceled"
  | "failed";

// Task Status Configuration
export const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  {
    label: string;
    color: "default" | "blue" | "orange" | "cyan" | "green" | "red" | "gray";
    description: string;
  }
> = {
  draft: {
    label: "Draft",
    color: "default",
    description: "Task created but not published yet",
  },
  created: {
    label: "Created",
    color: "default",
    description: "Legacy — equivalent to draft",
  },
  published: {
    label: "Published",
    color: "blue",
    description: "Task is available for couriers to claim",
  },
  assigned: {
    label: "Assigned",
    color: "orange",
    description: "Task has been claimed by a courier",
  },
  picked_up: {
    label: "Picked Up",
    color: "cyan",
    description: "Courier has picked up the package",
  },
  delivered: {
    label: "Delivered",
    color: "green",
    description: "Package has been delivered successfully",
  },
  canceled: {
    label: "Canceled",
    color: "gray",
    description: "Task has been canceled",
  },
  failed: {
    label: "Failed",
    color: "red",
    description: "Delivery attempt failed",
  },
};

// Valid status transitions
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["published", "canceled"],
  created: ["published", "canceled"], // legacy compat
  published: ["assigned", "canceled"],
  assigned: ["picked_up", "canceled"],
  picked_up: ["delivered", "failed", "canceled"],
  delivered: [],
  canceled: [],
  failed: [],
};

// Status transition handlers
export const canTransitionStatus = (
  from: TaskStatus,
  to: TaskStatus,
): boolean => {
  return TASK_STATUS_TRANSITIONS[from].includes(to);
};

export const getAvailableStatusTransitions = (
  currentStatus: TaskStatus,
): TaskStatus[] => {
  return TASK_STATUS_TRANSITIONS[currentStatus];
};

export const getStatusLabel = (status: TaskStatus): string => {
  return TASK_STATUS_CONFIG[status].label;
};

export const getStatusColor = (status: TaskStatus) => {
  return TASK_STATUS_CONFIG[status].color;
};

export interface Location {
  id: string;
  org_id: string;
  label?: string | null;
  address_text: string;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  created_at: string;
}

export interface DeliveryTask {
  id: string;
  org_id: string;
  order_id?: string | null;
  status: TaskStatus;
  pickup_location_id: string;
  dropoff_location_id: string;
  pickup_note?: string | null;
  dropoff_note?: string | null;
  note?: string | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  package_value?: number | null;
  delivery_fee: number;
  suggested_fee?: number | null;
  courier_id?: string | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  assigned_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  canceled_at?: string | null;
  failed_at?: string | null;
  // Joined relations
  pickup_location?: Location;
  dropoff_location?: Location;
  order?: Order;
}

export interface AvailableTask {
  task_id: string;
  org_id: string;
  order_id?: string | null;
  pickup_location_id: string;
  dropoff_location_id: string;
  pickup_note?: string | null;
  dropoff_note?: string | null;
  note?: string | null;
  package_value?: number | null;
  delivery_fee: number;
  suggested_fee?: number | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  status: TaskStatus;
  created_at: string;
  published_at?: string | null;
}

export interface TaskItem {
  id: string;
  task_id: string;
  product_id: string;
  qty: number;
  note?: string | null;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

// ── Orders System ──

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "ready_for_delivery"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type PaymentProvider = "qpay" | "stripe" | "bank" | "cash";

export interface Order {
  id: string;
  org_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations (optional)
  order_items?: OrderItem[];
  payment?: Payment;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: PaymentProvider;
  provider_ref: string | null;
  status: PaymentStatus;
  amount: number;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

// Order status configuration
export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    color: "default" | "blue" | "orange" | "cyan" | "green" | "red" | "gray";
    description: string;
  }
> = {
  pending_payment: {
    label: "Pending Payment",
    color: "default",
    description: "Waiting for customer payment",
  },
  paid: {
    label: "Paid",
    color: "blue",
    description: "Payment confirmed, awaiting merchant action",
  },
  preparing: {
    label: "Preparing",
    color: "orange",
    description: "Merchant is preparing the order",
  },
  ready_for_delivery: {
    label: "Ready for Delivery",
    color: "cyan",
    description: "Order is ready to be picked up / delivered",
  },
  cancelled: {
    label: "Cancelled",
    color: "gray",
    description: "Order has been cancelled",
  },
};

// Valid order status transitions (merchant-side only; paid is trigger-only)
export const ORDER_STATUS_TRANSITIONS: Partial<
  Record<OrderStatus, OrderStatus[]>
> = {
  paid: ["preparing", "cancelled"],
  preparing: ["ready_for_delivery", "cancelled"],
};

export const PAYMENT_STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; color: "default" | "blue" | "green" | "red" | "gray" }
> = {
  pending: { label: "Pending", color: "default" },
  paid: { label: "Paid", color: "green" },
  failed: { label: "Failed", color: "red" },
  refunded: { label: "Refunded", color: "gray" },
};
