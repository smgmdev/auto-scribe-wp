import { useState, useRef } from 'react';
import { Sparkles, Upload, X, Image as ImageIcon, Send, Loader2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { ArticleTone, FeaturedImage } from '@/types';

const toneOptions: { value: ArticleTone; label: string; color: string }[] = [
  { value: 'political', label: 'Political', color: 'bg-headline-political' },
  { value: 'business', label: 'Business', color: 'bg-headline-business' },
  { value: 'financial', label: 'Financial', color: 'bg-headline-financial' },
  { value: 'crypto', label: 'Crypto', color: 'bg-headline-crypto' },
  { value: 'realestate', label: 'Real Estate', color: 'bg-headline-realestate' },
];

export function ComposeView() {
  const { selectedHeadline, setSelectedHeadline, sites, addArticle } = useAppStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [tone, setTone] = useState<ArticleTone>('business');
  const [title, setTitle] = useState(selectedHeadline?.title || '');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [featuredImage, setFeaturedImage] = useState<FeaturedImage>({
    file: null,
    title: '',
    caption: '',
    altText: '',
    description: '',
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFeaturedImage({ ...featuredImage, file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setFeaturedImage({
      file: null,
      title: '',
      caption: '',
      altText: '',
      description: '',
    });
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!title) {
      toast({
        title: "Title required",
        description: "Please enter or select a headline first",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    // Simulate AI generation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const generatedContent = `The landscape of ${tone} news continues to evolve rapidly as stakeholders navigate an increasingly complex environment. Recent developments have underscored the importance of strategic positioning and informed decision-making in this dynamic sector.

Industry observers note that current trends reflect broader shifts in market sentiment and regulatory frameworks. The interplay between technological innovation and traditional approaches has created new opportunities while presenting fresh challenges for established players.

Market participants have responded to these changes with a mixture of caution and optimism. While some have adopted a wait-and-see approach, others have moved decisively to capitalize on emerging opportunities. This divergence in strategy reflects the uncertainty that characterizes the current moment.

Looking ahead, experts anticipate continued evolution in this space. The factors driving current trends show no signs of abating, suggesting that adaptability will remain a key determinant of success. Organizations that can effectively balance risk management with strategic growth initiatives are likely to emerge stronger from this period of transition.

The implications of these developments extend beyond immediate market considerations. Policymakers and regulators are closely monitoring the situation, recognizing that their decisions will shape the trajectory of the sector for years to come. This regulatory dimension adds another layer of complexity to an already multifaceted landscape.

As the situation continues to unfold, stakeholders across the spectrum remain focused on positioning themselves for success. The coming months will likely prove decisive in determining which approaches prove most effective in navigating this challenging environment.`;

    setContent(generatedContent);
    setIsGenerating(false);
    
    toast({
      title: "Article generated",
      description: "Your AI-written article is ready for review",
    });
  };

  const handlePublish = () => {
    if (!title || !content) {
      toast({
        title: "Missing content",
        description: "Please generate or write article content first",
        variant: "destructive",
      });
      return;
    }

    if (selectedSites.length === 0) {
      toast({
        title: "No sites selected",
        description: "Please select at least one WordPress site to publish to",
        variant: "destructive",
      });
      return;
    }

    addArticle({
      id: crypto.randomUUID(),
      title,
      content,
      tone,
      sourceHeadline: selectedHeadline || undefined,
      featuredImage: featuredImage.file ? featuredImage : undefined,
      status: 'published',
      publishedTo: selectedSites,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    toast({
      title: "Article published",
      description: `Successfully published to ${selectedSites.length} site(s)`,
    });

    // Reset form
    setTitle('');
    setContent('');
    setSelectedHeadline(null);
    setSelectedSites([]);
    removeImage();
  };

  const handleSaveDraft = () => {
    if (!title) {
      toast({
        title: "Title required",
        description: "Please enter a title for your draft",
        variant: "destructive",
      });
      return;
    }

    addArticle({
      id: crypto.randomUUID(),
      title,
      content,
      tone,
      sourceHeadline: selectedHeadline || undefined,
      featuredImage: featuredImage.file ? featuredImage : undefined,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    toast({
      title: "Draft saved",
      description: "Your article has been saved as a draft",
    });
  };

  const toggleSite = (siteId: string) => {
    setSelectedSites(prev => 
      prev.includes(siteId) 
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-4xl font-bold text-foreground">
          Compose Article
        </h1>
        <p className="mt-2 text-muted-foreground">
          Write or generate AI-powered articles for your WordPress sites
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Selected Headline */}
          {selectedHeadline && (
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Based on headline from</p>
                  <p className="font-medium text-sm">{selectedHeadline.source}.com</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setSelectedHeadline(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Article Title</Label>
            <Input
              id="title"
              placeholder="Enter your article title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-display"
            />
          </div>

          {/* Tone Selection */}
          <div className="space-y-2">
            <Label>Article Tone</Label>
            <div className="flex flex-wrap gap-2">
              {toneOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant={tone === option.value ? 'default' : 'outline'}
                  className={`cursor-pointer transition-all ${
                    tone === option.value 
                      ? `${option.color} text-white border-transparent` 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setTone(option.value)}
                >
                  {option.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button 
            variant="accent" 
            className="w-full"
            onClick={handleGenerate}
            disabled={isGenerating || !title}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Article with AI
              </>
            )}
          </Button>

          {/* Content Editor */}
          <div className="space-y-2">
            <Label htmlFor="content">Article Content</Label>
            <Textarea
              id="content"
              placeholder="Your article content will appear here after generation, or you can write manually..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[400px] font-body text-base leading-relaxed"
            />
            <p className="text-xs text-muted-foreground text-right">
              {content.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Featured Image */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Featured Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              {imagePreview ? (
                <div className="relative">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={removeImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-accent/5 transition-colors"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Upload Image</span>
                </button>
              )}

              {imagePreview && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="img-title" className="text-xs">Image Title</Label>
                    <Input
                      id="img-title"
                      placeholder="Image title"
                      value={featuredImage.title}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, title: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="img-alt" className="text-xs">Alt Text</Label>
                    <Input
                      id="img-alt"
                      placeholder="Alt text for accessibility"
                      value={featuredImage.altText}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, altText: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="img-caption" className="text-xs">Caption</Label>
                    <Input
                      id="img-caption"
                      placeholder="Image caption"
                      value={featuredImage.caption}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, caption: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="img-desc" className="text-xs">Description</Label>
                    <Textarea
                      id="img-desc"
                      placeholder="Image description"
                      value={featuredImage.description}
                      onChange={(e) => setFeaturedImage({ ...featuredImage, description: e.target.value })}
                      className="min-h-[60px] text-sm"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Publish To */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Publish To</CardTitle>
            </CardHeader>
            <CardContent>
              {sites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No WordPress sites connected. Add a site first.
                </p>
              ) : (
                <div className="space-y-2">
                  {sites.map((site) => (
                    <label 
                      key={site.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSites.includes(site.id)
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSites.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        selectedSites.includes(site.id)
                          ? 'bg-accent border-accent'
                          : 'border-muted-foreground/30'
                      }`}>
                        {selectedSites.includes(site.id) && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12">
                            <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium">{site.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-3">
            <Button 
              variant="accent" 
              className="w-full"
              onClick={handlePublish}
              disabled={!content || selectedSites.length === 0}
            >
              <Send className="mr-2 h-4 w-4" />
              Publish Article
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleSaveDraft}
              disabled={!title}
            >
              Save as Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
