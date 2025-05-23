"use client"

import { useState, useEffect } from "react"
import { ChevronRight } from "lucide-react"
import { APISDK, IDineInOrder, IDineInTable, IDineInTableBooking, IDish } from "@/libs/api"

interface IFilterOrder {
  order_id: string;
  table_id: string;
  updated_at: string;
  items: {
    dish_id: string;
    dish_name: string;
    quantity: number;
    total: number;
    instructions?: string;
    item_status: "pending" | "preparing" | "served" | "ready";
  }[];
  total: number;
  status: "pending" | "preparing" | "served" | "ready";
}

export function OrderPanel(
  {
    orders,
    dishes,
    tables,
    bookings,
  }: Readonly<{
    orders: IDineInOrder[];
    tables: IDineInTable[];
    dishes: IDish[];
    bookings: IDineInTableBooking[];
  }>
) {
  const [activeTab, setActiveTab] = useState("preparing")
  const [filteredOrders, setFilteredOrders] = useState<IFilterOrder[]>([])
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [tableStats, setTableStats] = useState<IDineInTableStats[]>([]);

  useEffect(() => {
    const fetchTableStats = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) return;
      
      try {
        const api = APISDK.getInstance(token);
        const response = await api.getTableStats();
        setTableStats(response.data);
      } catch (error) {
        console.error("Failed to fetch table stats:", error);
      }
    };
  
    fetchTableStats();
  }, [orders]);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  const genOrders = orders
  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  .map((order) => {
    const table = tables.find((table) => table.table_number === order.table_id);
    const tableData = tableStats.find(stat => stat.table_number === order.table_id);

    const orderItems = order.items.map(item => {
      const dish = dishes.find(d => d.id === item.dish_id);
      // Find the corresponding item status from tableStats
      const statItem = tableData?.items.find(i => i.dish_id === item.dish_id);
      
      return {
        dish_id: item.dish_id,
        dish_name: dish?.name ?? "Unknown Dish",
        quantity: item.quantity,
        total: (dish?.price || 0) * item.quantity,
        instructions: item.instructions,
        item_status: (statItem?.item_status || "pending") as "pending" | "preparing" | "served" | "ready"
      };
    });

    const total = orderItems.reduce((sum: number, item) => sum + item.total, 0);

    return {
      order_id: order.id,
      table_id: table?.table_number ?? "Unknown",
      items: orderItems,
      total,
      status: order.order_status as 'pending' | 'preparing' | 'served' | 'ready',
      updated_at: order.updated_at.toString()
    };
  });
  // Calculate counts for each tab
  const tabCounts = {
    pending: genOrders.filter(order => order.status === 'pending').length,
    preparing: genOrders.filter(order => order.status === 'preparing').length,
    served: genOrders.filter(order => order.status === 'served').length,
    ready: genOrders.filter(order => order.status === 'ready').length,
  }

  const tabs = [
    { id: "pending", label: "New Orders", count: tabCounts.pending },
    { id: "preparing", label: "Preparing", count: tabCounts.preparing },
    { id: "served", label: "Served", count: tabCounts.served },
    { id: "ready", label: "Ready", count: tabCounts.ready },
  ]

  const getStatusDisplay = (status: string | undefined) => {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Filter orders based on active tab
  useEffect(() => {
    setFilteredOrders(genOrders.filter(order => order.status === activeTab));
  }, [activeTab, orders, bookings, dishes, tables]);

  const handleStatusChange = async (order: IFilterOrder) => {
    setLoadingOrderId(order.order_id);
    const token = localStorage.getItem("access_token");
    if (!token) {
      console.error("No access token found in localStorage");
      setLoadingOrderId(null);
      return;
    }

    try {
      const api = APISDK.getInstance(token);
      let nextStatus: 'pending' | 'preparing' | 'served' | 'ready';

      switch (order.status) {
        case 'pending':
          nextStatus = 'preparing';
          await api.markOrderAsPreparing(order.order_id);
          break;
        case 'preparing':
          nextStatus = 'served';
          await api.markOrderAsServed(order.order_id);
          break;
        case 'served':
          nextStatus = 'ready';
          await api.markOrderAsReady(order.order_id);
          break;
        default:
          nextStatus = 'ready';
      }

      // Update local state
      setFilteredOrders(prev =>
        prev.map(o => o.order_id === order.order_id ? { ...o, status: nextStatus } : o)
      );

      // Wait for parent component to fetch new data
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          const updatedOrder = orders.find(o => o.id === order.order_id);
          if (updatedOrder && updatedOrder.order_status === nextStatus) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 500); // Check every 500ms

        // Set a timeout to prevent infinite loading
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(false);
        }, 10000); // Maximum 10 seconds wait
      });

    } catch (error) {
      console.error("Failed to update order status:", error);
    } finally {
      setLoadingOrderId(null);
    }
  }

  // Get button text based on current status
  // Modify the getButtonText function
  const getButtonText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Start Preparing';
      case 'preparing':
        return 'Mark as Served';
      case 'served':
        return 'Complete Order';
      default:
        return '';
    }
  }

  const handleRemoveItem = async (order: IFilterOrder, dish_id: string) => {
    if (window.confirm("This will remove the item from the current order. Proceed?")) {
      const updatedItems = order.items
        .filter(item => item.dish_id !== dish_id)
        .map(item => ({ dish_id: item.dish_id, quantity: item.quantity })); // Send only dish_id and quantity
      console.log(updatedItems)
      const token = localStorage.getItem("access_token");
      if (!token) {
        console.error("No access token found in localStorage");
        return;
      }

      if (!token) {
        console.error("No access token found in localStorage");
        return;
      }

      const api = APISDK.getInstance(token);

      try {
        await api.updateOrDeleteOrder(order.order_id, { items: updatedItems });
        // setFilteredOrders(prev => prev.map(o => o.order_id === order.order_id ? { ...o, items: updatedItems } : o));
      } catch (error) {
        console.error("Failed to update order:", error);
      }
    }
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`flex-1 py-3 cursor-pointer text-center relative ${activeTab === tab.id ? "text-orange-500 font-medium" : "text-gray-600"
              }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="ml-1 bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded-full">{tab.count}</span>
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500"></div>}
          </button>
        ))}
      </div>

      {/* Order cards */}
      <div className="p-4 space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No {activeTab} orders at the moment
          </div>
        ) : (
          // Reverse the filteredOrders array to show new orders at the bottom
          filteredOrders.map((order) => (
            <div key={order.order_id} className="border rounded-lg overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gray-200 rounded-full mr-3 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-800">Table - {order.table_id}</h3>
                      <div className="flex flex-col">
                        <p className="text-sm text-blue-400">
                          Order #{order.order_id.substring(0, 8)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Last updated: {formatDateTime(order.updated_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {order.items.map((item, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex-1">
                          <span className="text-gray-700">{item.dish_name}</span>
                          <span className="text-gray-500 text-sm ml-2">×{item.quantity}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${item.item_status === 'pending' ? 'bg-gray-100 text-gray-600' :
                              item.item_status === 'preparing' ? 'bg-orange-100 text-orange-600' :
                                item.item_status === 'served' ? 'bg-green-100 text-green-600' :
                                  'bg-blue-100 text-blue-600'
                            }`}>
                            {getStatusDisplay(item.item_status)}
                          </span>
                          {order.status === 'pending' && item.item_status === 'pending' && (
                            <button
                              onClick={() => handleRemoveItem(order, item.dish_id)}
                              className="text-red-500 mx-1"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      {item.instructions && (
                        <p className="text-sm text-gray-500 italic">
                          Note: {item.instructions}
                        </p>
                      )}
                      <div className="text-sm text-gray-600">
                        ₹{item.total}
                      </div>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-sm font-medium text-gray-900">
                      Total: ₹{order.total}
                    </div>
                    {order.status !== 'ready' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleStatusChange(order)}
                          disabled={loadingOrderId === order.order_id}
                          className={`flex-1 ${loadingOrderId === order.order_id
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-orange-500 hover:bg-orange-600'
                            } text-white py-2 px-4 rounded transition duration-200`}
                        >
                          {loadingOrderId === order.order_id
                            ? 'Processing...'
                            : getButtonText(order.status)
                          }
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
