import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'check-status',
    title: 'Check Order Status',
    content: (
      <div className="space-y-4">
        <p>Stay informed about your orders with real-time status tracking:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to the "My Orders" section in your dashboard</li>
          <li>View all your orders with their current status at a glance</li>
          <li>Click on any order to open the order chat and see full details</li>
          <li>Check the delivery countdown for accepted orders</li>
        </ol>
        <p>
          Status updates happen in real-time — no need to refresh your dashboard.
        </p>
      </div>
    ),
  },
  {
    id: 'track-orders',
    title: 'Track Your Orders',
    content: (
      <div className="space-y-4">
        <p>Order tracking provides visibility into every stage of the publication process:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Order Placed:</strong> Order placed, agency is working on delivery</li>
          <li><strong>Offer Accepted:</strong> Offer was accepted; order is now active</li>
          <li><strong>Offer Rejected:</strong> Offer was declined; you can renegotiate or exit</li>
          <li><strong>Order Delivered:</strong> Article is live — delivery link provided in chat</li>
          <li><strong>Revision Requested:</strong> You've flagged changes after delivery</li>
          <li><strong>Order Cancelled:</strong> Order was cancelled; credits returned to your balance</li>
          <li><strong>Dispute Opened:</strong> Dispute raised and under review by our team</li>
          <li><strong>Dispute Resolved:</strong> Staff has resolved the dispute and finalized the outcome</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'delivery-confirmation',
    title: 'Delivery Confirmation',
    content: (
      <div className="space-y-4">
        <p>When your article is published, you'll receive:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Live URL:</strong> A direct link to your published article inside the order chat</li>
          <li><strong>Dashboard Update:</strong> Order status changes to "Delivered" in real-time</li>
          <li><strong>Notification:</strong> In-platform notification in the dashboard sidebar</li>
        </ul>
        <p>
          We recommend verifying the published article to confirm it looks correct.
          If there are issues, use the revision request or raise a dispute within the order chat.
        </p>
      </div>
    ),
  },
  {
    id: 'order-chat',
    title: 'Communicating with Agencies',
    content: (
      <div className="space-y-4">
        <p>
          Every order comes with a dedicated real-time chat between you and the agency.
          You can access it from "My Requests" in your dashboard:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Send messages, ask questions, and share additional materials</li>
          <li>Receive delivery notifications and links directly in the chat</li>
          <li>Request revisions by using the revision button inside the chat</li>
          <li>A live delivery countdown timer is shown once the order is accepted</li>
        </ul>
        <p>
          <strong>Important:</strong> All communication must remain on-platform. Sharing personal
          contact details (email, phone, etc.) is against our platform guidelines.
        </p>
      </div>
    ),
  },
  {
    id: 'cancel-order',
    title: 'Cancel an Order',
    content: (
      <div className="space-y-4">
        <p>Need to cancel an order? Here's what you need to know:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Before Acceptance:</strong> Full credit refund — cancel directly from the order details</li>
          <li><strong>After Acceptance:</strong> Contact the agency through the order chat to agree on cancellation</li>
          <li><strong>In Progress:</strong> Open a support ticket for case-by-case review</li>
        </ul>
        <p>
          To cancel, go to your order and use the "Cancel Order" option if available,
          or contact our support team for assistance.
        </p>
      </div>
    ),
  },
  {
    id: 'disputes',
    title: 'Raising a Dispute',
    content: (
      <div className="space-y-4">
        <p>
          If you believe an order was not delivered as agreed, you can raise a dispute:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Open the order chat from "My Requests"</li>
          <li>Click "Raise Dispute" and describe the issue</li>
          <li>Our team will review the situation and mediate</li>
          <li>A resolution (credit refund or order completion) will be issued</li>
        </ol>
        <p>
          Disputes are reviewed by the Arcana Mace team. Both parties are contacted and
          the outcome is communicated through the platform.
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
          Learn how to check order status, track publications, communicate with agencies,
          request revisions, and raise disputes.
        </p>
      }
      sections={sections}
    />
  );
}
