'use client';

import { TOPIC_CATEGORIES, TopicCategory } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { 
  Building2, 
  Banknote, 
  Briefcase,
  Trophy,
  Plane,
  GraduationCap,
  Heart,
  Shield,
  Leaf,
  Cpu,
  Globe,
  Film,
  CircleDot
} from 'lucide-react';

const TOPIC_ICONS: Record<TopicCategory, React.ReactNode> = {
  politics: <Building2 className="h-6 w-6" />,
  economy: <Banknote className="h-6 w-6" />,
  business: <Briefcase className="h-6 w-6" />,
  cricket: <CircleDot className="h-6 w-6" />,
  sports: <Trophy className="h-6 w-6" />,
  tourism: <Plane className="h-6 w-6" />,
  education: <GraduationCap className="h-6 w-6" />,
  health: <Heart className="h-6 w-6" />,
  crime: <Shield className="h-6 w-6" />,
  environment: <Leaf className="h-6 w-6" />,
  technology: <Cpu className="h-6 w-6" />,
  international: <Globe className="h-6 w-6" />,
  entertainment: <Film className="h-6 w-6" />,
};

const TOPIC_DESCRIPTIONS: Record<TopicCategory, string> = {
  politics: 'Government, elections, policy decisions, and political developments',
  economy: 'Economic indicators, inflation, trade, and fiscal policy',
  business: 'Corporate news, startups, markets, and industry updates',
  cricket: 'Sri Lanka cricket team, domestic leagues, and international matches',
  sports: 'Football, rugby, athletics, and other sporting events',
  tourism: 'Travel, hospitality, tourist arrivals, and destinations',
  education: 'Schools, universities, examinations, and educational policy',
  health: 'Healthcare, medical news, public health, and wellness',
  crime: 'Law enforcement, court cases, and crime reports',
  environment: 'Climate, wildlife, conservation, and environmental issues',
  technology: 'Tech industry, digital transformation, and innovation',
  international: 'Global affairs, diplomacy, and foreign relations',
  entertainment: 'Movies, music, TV, celebrities, and cultural events',
};

export default function TopicsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Topics</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Browse news by topic. Each story is automatically categorized using AI analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {TOPIC_CATEGORIES.map((topic) => (
          <Card 
            key={topic}
            className="p-6 hover:shadow-lg transition-all duration-200 hover:border-brand-primary/30 cursor-pointer group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl group-hover:bg-brand-primary group-hover:text-white transition-colors">
                {TOPIC_ICONS[topic]}
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-lg text-gray-900 dark:text-white capitalize mb-1 group-hover:text-brand-primary transition-colors">
                  {topic}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {TOPIC_DESCRIPTIONS[topic]}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6 mt-8 bg-gray-50 dark:bg-gray-900">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-2">How Topics Work</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Our AI analyzes each article to identify relevant topics. Articles can have multiple topics 
          associated with them. Topic classification helps you find related coverage and understand 
          how different stories connect.
        </p>
      </Card>
    </div>
  );
}
