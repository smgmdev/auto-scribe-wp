import { useState } from 'react';
import { Globe, Plus, Trash2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { SEOPlugin } from '@/types';
export function SitesView() {
  const {
    sites,
    addSite,
    removeSite
  } = useAppStore();
  const {
    toast
  } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    username: '',
    applicationPassword: '',
    seoPlugin: 'aioseo' as SEOPlugin
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.url || !formData.username || !formData.applicationPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    addSite(formData);
    setFormData({
      name: '',
      url: '',
      username: '',
      applicationPassword: '',
      seoPlugin: 'aioseo'
    });
    setIsOpen(false);
    toast({
      title: "Site connected",
      description: `${formData.name} has been added successfully`
    });
  };
  const handleRemove = (id: string, name: string) => {
    removeSite(id);
    toast({
      title: "Site removed",
      description: `${name} has been disconnected`
    });
  };
  return <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-foreground">
            Media Network  
          </h1>
          <p className="mt-2 text-muted-foreground">Connect and manage media sites</p>
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
                <Input id="name" placeholder="My Blog" value={formData.name} onChange={e => setFormData({
                ...formData,
                name: e.target.value
              })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">Site URL</Label>
                <Input id="url" type="url" placeholder="https://example.com" value={formData.url} onChange={e => setFormData({
                ...formData,
                url: e.target.value
              })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="admin" value={formData.username} onChange={e => setFormData({
                ...formData,
                username: e.target.value
              })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Application Password</Label>
                <Input id="password" type="password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" value={formData.applicationPassword} onChange={e => setFormData({
                ...formData,
                applicationPassword: e.target.value
              })} />
                <p className="text-xs text-muted-foreground">
                  Generate this in WordPress under Users → Profile → Application Passwords
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="seoPlugin">SEO Plugin</Label>
                <Select value={formData.seoPlugin} onValueChange={(value: SEOPlugin) => setFormData({
                ...formData,
                seoPlugin: value
              })}>
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
      {sites.length === 0 ? <Card className="border-dashed border-2">
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
        </Card> : <div className="space-y-2">
          {sites.map((site, index) => <Card key={site.id} className="group hover:shadow-md transition-all duration-300" style={{
        animationDelay: `${index * 50}ms`
      }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 overflow-hidden">
                      <img src={site.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.url)}&sz=64`} alt={`${site.name} favicon`} className="h-5 w-5 object-contain" onError={e => {
                  e.currentTarget.style.display = 'none';
                  (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                }} />
                      <Globe className="h-4 w-4 text-accent hidden" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-sm truncate">{site.name}</h3>
                      <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1">
                        <span className="truncate">{site.url.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {site.seoPlugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                    </Badge>
                    {site.connected ? <div className="flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-success" />
                        <span className="text-xs text-success">Connected</span>
                      </div> : <div className="flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-xs text-destructive">Disconnected</span>
                      </div>}
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={() => handleRemove(site.id, site.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>)}
        </div>}
    </div>;
}