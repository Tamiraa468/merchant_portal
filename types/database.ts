export type UserRole = "org_user" | "admin" | "courier" | "customer" | "merchant";

export type OrgType = "restaurant" | "store" | "pharmacy" | "warehouse";

// Roles allowed to access merchant pages
export const MERCHANT_ALLOWED_ROLES: UserRole[] = ["org_user", "admin", "merchant"];

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
  unavailable_until?: string | null;
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

// Delivery Task Types — 'canceled' removed; 'cancelled' is the canonical spelling.
export type TaskStatus =
  | "draft"
  | "created"
  | "published"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "completed"
  | "cancelled"
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
    description: "Package has been delivered, awaiting OTP confirmation",
  },
  completed: {
    label: "Completed",
    color: "green",
    description: "Delivery confirmed via ePOD — earnings recorded",
  },
  cancelled: {
    label: "Cancelled",
    color: "gray",
    description: "Task has been cancelled",
  },
  failed: {
    label: "Failed",
    color: "red",
    description: "Delivery attempt failed",
  },
};

// Valid status transitions
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["published", "cancelled"],
  created: ["published", "cancelled"], // legacy compat
  published: ["assigned", "cancelled"],
  assigned: ["picked_up", "cancelled"],
  picked_up: ["delivered", "failed", "cancelled"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
  failed: [],
};

// Status transition helpers
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
  return TASK_STATUS_CONFIG[status]?.label ?? status;
};

export const getStatusColor = (status: TaskStatus) => {
  return TASK_STATUS_CONFIG[status]?.color ?? "default";
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
  customer_email?: string | null;
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
  completed_at?: string | null;
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

// ── Org Settings ──

export interface OrgSettings {
  org_id: string;
  store_name: string | null;
  store_address: string | null;
  store_phone: string | null;
  store_description: string | null;
  logo_url: string | null;
  is_accepting_orders: boolean;
  weekly_hours: WeeklyHour[];
  updated_at: string;
}

export interface WeeklyHour {
  day: number; // 0=Sun … 6=Sat
  open: string; // "09:00"
  close: string; // "21:00"
  closed: boolean;
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_WEEKLY_HOURS: WeeklyHour[] = DAY_NAMES.map((_, day) => ({
  day,
  open: "09:00",
  close: "21:00",
  closed: day === 0, // Sunday closed by default
}));
