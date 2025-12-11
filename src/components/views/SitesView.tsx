import { useState } from 'react';
import { Globe, Plus, Trash2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { SEOPlugin } from '@/types';

export function SitesView() {
  const { sites, addSite, removeSite } = useAppStore();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    username: '',
    applicationPassword: '',
    seoPlugin: 'aioseo' as SEOPlugin,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.url || !formData.username || !formData.applicationPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    addSite(formData);
    setFormData({ name: '', url: '', username: '', applicationPassword: '', seoPlugin: 'aioseo' });
    setIsOpen(false);
    
    toast({
      title: "Site connected",
      description: `${formData.name} has been added successfully`,
    });
  };

  const handleRemove = (id: string, name: string) => {
    removeSite(id);
    toast({
      title: "Site removed",
      description: `${name} has been disconnected`,
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-foreground">
            WordPress Sites
          </h1>
          <p className="mt-2 text-muted-foreground">
            Connect and manage your WordPress sites
          </p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="accent">
              <Plus className="mr-2 h-4 w-4" />
              Add Site
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Connect WordPress Site</DialogTitle>
              <DialogDescription>
                Enter your WordPress site details. You'll need an application password for authentication.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Site Name</Label>
                <Input
                  id="name"
                  placeholder="My Blog"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">Site URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="admin"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Application Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  value={formData.applicationPassword}
                  onChange={(e) => setFormData({ ...formData, applicationPassword: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Generate this in WordPress under Users → Profile → Application Passwords
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="seoPlugin">SEO Plugin</Label>
                <Select 
                  value={formData.seoPlugin} 
                  onValueChange={(value: SEOPlugin) => setFormData({ ...formData, seoPlugin: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select SEO plugin" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    <SelectItem value="aioseo">AIO SEO PRO</SelectItem>
                    <SelectItem value="rankmath">Rank Math</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the SEO plugin installed on this WordPress site
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="accent">
                  Connect Site
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sites Grid */}
      {sites.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Globe className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-display text-xl font-semibold">No sites connected</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
              Connect your first WordPress site to start publishing articles
            </p>
            <Button variant="accent" className="mt-6" onClick={() => setIsOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Site
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sites.map((site, index) => (
            <Card 
              key={site.id} 
              className="group hover:shadow-lg transition-all duration-300"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 overflow-hidden">
                    {site.favicon ? (
                      <img 
                        src={site.favicon} 
                        alt={`${site.name} favicon`}
                        className="h-6 w-6 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <Globe className={`h-5 w-5 text-accent ${site.favicon ? 'hidden' : ''}`} />
                  </div>
                  <div>
                    <CardTitle className="font-display text-lg">{site.name}</CardTitle>
                    <a 
                      href={site.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1"
                    >
                      {site.url.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-xs">
                    {site.seoPlugin === 'aioseo' ? 'AIO SEO PRO' : 'Rank Math'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {site.connected ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span className="text-sm text-success">Connected</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-sm text-destructive">Disconnected</span>
                      </>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(site.id, site.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
