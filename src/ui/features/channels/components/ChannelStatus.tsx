
import { ChannelStatus as ChannelStatusType } from './types';

interface ChannelStatusProps {
  status?: ChannelStatusType;
}

export function ChannelStatus({ status }: ChannelStatusProps) {
  if (!status) {
    return (
      <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
        Unknown
      </span>
    );
  }

  switch (status.status) {
    case 'connected':
      return (
        <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
          Connected
        </span>
      );
    case 'starting':
      return (
        <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">
          Starting...
        </span>
      );
    case 'qr':
      return (
        <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">
          QR Code
        </span>
      );
    case 'reconnecting':
      return (
        <span className="px-2 py-1 text-xs rounded bg-orange-100 text-orange-700">
          Reconnecting
        </span>
      );
    case 'error':
      return (
        <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
          Error
        </span>
      );
    default:
      return (
        <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
          Stopped
        </span>
      );
  }
}
