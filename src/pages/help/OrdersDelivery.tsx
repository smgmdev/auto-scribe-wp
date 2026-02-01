import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'check-status',
    title: 'Check Order Status',
    content: (
      <div className="space-y-4">
        <p>
          Stay informed about your orders with real-time status tracking:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to the "Orders" section in your dashboard</li>
          <li>View all your orders with their current status</li>
          <li>Click on any order to see detailed information</li>
          <li>Check the activity log for status updates</li>
        </ol>
        <p>
          You'll also receive email notifications when your order status changes.
        </p>
      </div>
    ),
  },
  {
    id: 'track-orders',
    title: 'Track Your Orders',
    content: (
      <div className="space-y-4">
        <p>
          Order tracking provides visibility into every stage of the publication process:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Order Placed:</strong> Your submission has been received</li>
          <li><strong>Accepted:</strong> Agency has accepted and is processing</li>
          <li><strong>In Review:</strong> Content is being reviewed</li>
          <li><strong>Publishing:</strong> Article is being published</li>
          <li><strong>Delivered:</strong> Article is live with confirmation link</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'delivery-confirmation',
    title: 'Delivery Confirmation',
    content: (
      <div className="space-y-4">
        <p>
          When your article is published, you'll receive:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Live URL:</strong> Direct link to your published article</li>
          <li><strong>Email Notification:</strong> Confirmation sent to your registered email</li>
          <li><strong>Dashboard Update:</strong> Order status changes to "Delivered"</li>
        </ul>
        <p>
          We recommend verifying the published article to ensure everything looks correct. 
          If you notice any issues, contact support immediately.
        </p>
      </div>
    ),
  },
  {
    id: 'cancel-order',
    title: 'Cancel an Order',
    content: (
      <div className="space-y-4">
        <p>
          Need to cancel an order? Here's what you need to know:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Before Acceptance:</strong> Full credit refund available</li>
          <li><strong>After Acceptance:</strong> Partial refund may apply</li>
          <li><strong>In Progress:</strong> Contact support for case-by-case review</li>
        </ul>
        <p>
          To cancel, go to your order details and click "Cancel Order" if available, 
          or contact our support team for assistance.
        </p>
      </div>
    ),
  },
  {
    id: 'order-history',
    title: 'View Order History',
    content: (
      <div className="space-y-4">
        <p>
          Access your complete order history in the dashboard:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>View all past and current orders</li>
          <li>Filter by status, date, or publication</li>
          <li>Export order data for reporting</li>
          <li>Access delivery links for all completed orders</li>
        </ul>
        <p>
          Your order history is retained indefinitely, so you can always reference 
          past publications.
        </p>
      </div>
    ),
  },
];

export default function OrdersDelivery() {
  return (
    <HelpArticleLayout
      title="Orders & Delivery"
      category="Orders & Delivery"
      categorySlug="orders-delivery"
      intro={
        <p>
          Learn how to check order status, track publications, receive delivery confirmations, 
          and manage your order history.
        </p>
      }
      sections={sections}
    />
  );
}
