import { Bot } from 'lucide-react';

export function AdminAIPublishingView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">AI Publishing</h1>
      </div>
      
      <div className="bg-muted/50 rounded-lg p-8 text-center">
        <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
        <p className="text-muted-foreground">
          AI Publishing features are currently under development.
        </p>
      </div>
    </div>
  );
}
