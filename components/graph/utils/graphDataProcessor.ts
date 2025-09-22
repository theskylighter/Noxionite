import type { SiteMap } from '@/lib/context/types';
import type { LocaleTagGraphData } from '@/lib/context/tag-graph';
import type { GraphData, GraphNode, GraphLink } from '../types/graph.types';
import { HOME_NODE_ID, ALL_TAGS_NODE_ID, GRAPH_CONFIG } from './graphConfig';
import siteConfig from 'site.config';
import siteLocaleConfig from '../../../site.locale.json';

// Image cache for better performance
const imageCache = new Map<string, HTMLImageElement>();

export const preloadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    if (imageCache.has(url)) {
      resolve(imageCache.get(url)!);
      return;
    }

    const img = new Image();
    img.addEventListener('load', () => {
      imageCache.set(url, img);
      resolve(img);
    });
    img.addEventListener('error', reject);
    img.src = url;
  });
};

export const createPostGraphData = (
  siteMap: SiteMap,
  locale: string
): GraphData => {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const processedPages = new Set<string>();

  if (!siteMap?.pageInfoMap) {
    return { nodes: [], links: [] };
  }

  // Create home node with favicon
  const homeImageUrl = '/icon.png';
  const homeNode: GraphNode = {
    id: HOME_NODE_ID,
    name: siteConfig.name,
    description: siteConfig.description,
    type: 'Root' as any,
    url: '/',
    color: '#8B5CF6',
    size: GRAPH_CONFIG.visual.HOME_NODE_SIZE,
    val: GRAPH_CONFIG.visual.HOME_NODE_SIZE,
    imageUrl: homeImageUrl,
  };
  
  // Preload home node image
  if (homeImageUrl) {
    preloadImage(homeImageUrl).then(img => {
      homeNode.img = img;
    }).catch(() => {
      // Fallback to favicon emoji if image fails to load
      console.warn('Failed to load home node image');
    });
  }
  
  nodes.push(homeNode);

  // Create database nodes with proper names, slugs, and cover images
  const dbIds = siteConfig.notionDbIds || [];
  const databaseNodes = new Map<string, GraphNode>();
  
  // Create database nodes for all databases using notionDbIds and databaseInfoMap
  dbIds.forEach(dbId => {
    // The databaseInfoMap uses keys in format `${dbId}_${locale}` or `${dbId}_default`
    const dbKey = siteMap.databaseInfoMap?.[`${dbId}_${locale}`] 
      ? `${dbId}_${locale}` 
      : `${dbId}_default`;
    

  
  // Get database info from siteMap.databaseInfoMap
  const dbInfo = siteMap.databaseInfoMap?.[dbKey];
  if (!dbInfo) return; // Skip if database info not found
  
  const dbName = dbInfo.name && typeof dbInfo.name === 'object' 
    ? (dbInfo.name as Record<string, string>)[locale] || (dbInfo.name as Record<string, string>)[siteLocaleConfig.defaultLocale] || 'Database'
    : (typeof dbInfo.name === 'string' ? dbInfo.name : 'Database');
    const dbSlug = dbInfo.slug || dbId;
    const coverImage = dbInfo.coverImage;
    
    const dbNode: GraphNode = {
      id: dbId, // Use the actual dbId for node ID to match parentDbId values
      name: dbName,
      slug: dbSlug,
      url: `/category/${dbSlug}`,
      type: 'Database' as any,
      color: '#FF6B6B', // Red color for database nodes
      size: GRAPH_CONFIG.visual.DB_NODE_SIZE,
      val: GRAPH_CONFIG.visual.DB_NODE_SIZE,
      imageUrl: coverImage || undefined,
    };
    
    // Preload database cover image if available
    if (coverImage) {
      preloadImage(coverImage).then(img => {
        dbNode.img = img;
      }).catch(() => {
        console.warn(`Failed to load database cover image: ${coverImage}`);
      });
    }
    
    databaseNodes.set(dbId, dbNode);
    nodes.push(dbNode);
    
    // Database links will be created after all nodes are collected
  });

  // Create nodes for all pages (excluding Database-type pages)
  Object.entries(siteMap.pageInfoMap).forEach(([pageId, pageInfo]) => {
    if (processedPages.has(pageId)) return;
    if (pageInfo.language !== locale) return;
    if (pageInfo.type === 'Database') return; // Skip Database-type pages

    const imageUrl = pageInfo.coverImage || undefined;
    
    const node: GraphNode = {
      id: pageId,
      name: pageInfo.title || 'Untitled',
      slug: pageInfo.slug,
      url: pageInfo.slug ? `/${pageInfo.slug}` : '#',
      type: (pageInfo.type || 'Post') as any,
      color: pageInfo.type === 'Category' ? '#8B5CF6' : '#3B82F6',
      size: pageInfo.type === 'Category' 
        ? GRAPH_CONFIG.visual.CATEGORY_NODE_SIZE 
        : GRAPH_CONFIG.visual.POST_NODE_SIZE,
      imageUrl,
      val: pageInfo.type === 'Category' 
        ? GRAPH_CONFIG.visual.CATEGORY_NODE_SIZE 
        : GRAPH_CONFIG.visual.POST_NODE_SIZE,
    };

    // Preload cover images
    if (imageUrl) {
      preloadImage(imageUrl).then(img => {
        node.img = img;
      }).catch(() => {
        // Image failed to load, will use default styling
        console.warn(`Failed to load image for ${pageInfo.title}: ${imageUrl}`);
      });
    }

    nodes.push(node);
    processedPages.add(pageId);

    });

  // Collect all valid node IDs after all nodes are created
  const validNodeIds = new Set(nodes.map(n => n.id));

  // Create database links after validation
  dbIds.forEach(dbId => {
    if (validNodeIds.has(HOME_NODE_ID) && validNodeIds.has(dbId)) {
      links.push({
        source: HOME_NODE_ID,
        target: dbId,
        color: '#E5E7EB',
        width: 1.5,
      });
    }
  });

  // Create links based on parent relationships - ensuring proper hierarchy
  Object.entries(siteMap.pageInfoMap).forEach(([pageId, pageInfo]) => {
    if (pageInfo.language !== locale) return;
    if (pageInfo.type === 'Database') return;
    
    if (pageInfo.parentDbId && pageInfo.parentDbId !== pageId) {
      // For pages within a database - connect to database first
      if (!pageInfo.parentPageId) {
        // Top-level items in database connect directly to their database
        // Only create link if database node exists
        if (databaseNodes.has(pageInfo.parentDbId) && validNodeIds.has(pageInfo.parentDbId) && validNodeIds.has(pageId)) {
          links.push({
            source: pageInfo.parentDbId,
            target: pageId,
            color: '#E5E7EB',
            width: 1,
          });
        } else if (validNodeIds.has(HOME_NODE_ID) && validNodeIds.has(pageId)) {
          // Fallback to home if database node doesn't exist
          links.push({
            source: HOME_NODE_ID,
            target: pageId,
            color: '#E5E7EB',
            width: 1,
          });
        }
      } else if (siteMap.pageInfoMap[pageInfo.parentPageId] && validNodeIds.has(pageInfo.parentPageId) && validNodeIds.has(pageId)) {
        // Child items connect to their parent within the hierarchy
        links.push({
          source: pageInfo.parentPageId,
          target: pageId,
          color: '#E5E7EB',
          width: 1,
        });
      }
    } else if (pageInfo.parentPageId && siteMap.pageInfoMap[pageInfo.parentPageId] && validNodeIds.has(pageInfo.parentPageId) && validNodeIds.has(pageId)) {
      // Regular parent-child relationships for non-database items
      links.push({
        source: pageInfo.parentPageId,
        target: pageId,
        color: '#E5E7EB',
        width: 1,
      });
    } else if (pageId !== HOME_NODE_ID && validNodeIds.has(HOME_NODE_ID) && validNodeIds.has(pageId)) {
      // Standalone items link to home
      links.push({
        source: HOME_NODE_ID,
        target: pageId,
        color: '#E5E7EB',
        width: 1,
      });
    }
  });

  return { nodes, links };
};

// Helper function to calculate node size based on count using logarithmic scale
const calculateNodeSize = (count: number): number => {
  return Math.log(count + 1) * 5 + 5;
};

// Helper function to get node color based on role
const getNodeColor = (role: 'ambassador' | 'hub' | 'leaf'): string => {
  switch (role) {
    case 'ambassador':
      return '#8B5CF6'; // Purple for ambassador
    case 'hub':
      return '#10B981'; // Green for hub
    case 'leaf':
      return '#6B7280'; // Gray for leaf
    default:
      return '#10B981';
  }
};

// Analyze tags within each post to classify as hub or leaf
interface PostTagAnalysis {
  postTagRoles: Record<string, Record<string, 'hub' | 'leaf'>>; // postId -> tag -> role
  leafToHubMap: Record<string, string[]>; // leaf tag -> hub/ambassador tags it's connected to
  hubConnections: Array<{source: string, target: string}>; // hub-to-hub connections within posts
  tagRoles: Record<string, 'hub' | 'leaf'>; // global tag role based on post-level analysis
}

const analyzePostLevelTags = (
  tagGraphData: LocaleTagGraphData,
  locale: string
): PostTagAnalysis => {
  const postTagRoles: Record<string, Record<string, 'hub' | 'leaf'>> = {};
  const leafToHubMap: Record<string, string[]> = {};
  const hubConnections: Array<{source: string, target: string}> = [];
  const tagRoles: Record<string, 'hub' | 'leaf'> = {};

  // Process each post's tags
  Object.entries(tagGraphData.tagPages || {}).forEach(([tag, pageIds]) => {
    pageIds.forEach(pageId => {
      if (!postTagRoles[pageId]) {
        postTagRoles[pageId] = {};
      }
      
      // Count tag occurrences within this post
      const pageTags = Object.keys(tagGraphData.tagPages).filter(t => 
        tagGraphData.tagPages[t].includes(pageId)
      );
      
      const tagCountsInPost: Record<string, number> = {};
      pageTags.forEach(t => {
        tagCountsInPost[t] = (tagCountsInPost[t] || 0) + 1;
      });
      
      // Classify tags in this post
      const maxCount = Math.max(...Object.values(tagCountsInPost));
      
      pageTags.forEach(t => {
        const count = tagCountsInPost[t];
        if (count >= 2) {
          postTagRoles[pageId][t] = 'hub';
          tagRoles[t] = 'hub';
        } else if (count === 1) {
          postTagRoles[pageId][t] = 'leaf';
          // Only set to leaf if not already classified as hub in another post
          if (!tagRoles[t]) {
            tagRoles[t] = 'leaf';
          }
        }
      });
      
      // Handle case where all tags appear only once - pick first alphabetically as hub
      const allLeaf = Object.values(tagCountsInPost).every(count => count === 1);
      if (allLeaf && pageTags.length > 0) {
        const firstAlphabetical = pageTags.sort()[0];
        postTagRoles[pageId][firstAlphabetical] = 'hub';
        tagRoles[firstAlphabetical] = 'hub';
      }
    });
  });

  // Build leaf-to-hub connections and hub-to-hub connections
  Object.entries(postTagRoles).forEach(([pageId, roles]) => {
    const hubs = Object.entries(roles)
      .filter(([, role]) => role === 'hub')
      .map(([tag]) => tag);
    const leaves = Object.entries(roles)
      .filter(([, role]) => role === 'leaf')
      .map(([tag]) => tag);
    
    // Connect leaves to hubs
    leaves.forEach(leaf => {
      if (!leafToHubMap[leaf]) {
        leafToHubMap[leaf] = [];
      }
      hubs.forEach(hub => {
        if (!leafToHubMap[leaf].includes(hub)) {
          leafToHubMap[leaf].push(hub);
        }
      });
    });
    
    // Connect hubs to each other (all pairs)
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const connection = {
          source: hubs[i],
          target: hubs[j]
        };
        // Avoid duplicate connections
        if (!hubConnections.some(conn => 
          (conn.source === connection.source && conn.target === connection.target) ||
          (conn.source === connection.target && conn.target === connection.source)
        )) {
          hubConnections.push(connection);
        }
      }
    }
  });

  return { postTagRoles, leafToHubMap, hubConnections, tagRoles };
};

// Determine global tag roles (ambassador/hub/leaf)
const determineTagRoles = (
  tagCounts: Record<string, number>,
  postAnalysis: PostTagAnalysis
): Record<string, 'ambassador' | 'hub' | 'leaf'> => {
  const roles: Record<string, 'ambassador' | 'hub' | 'leaf'> = {};
  
  // First, set base roles from post analysis
  Object.entries(postAnalysis.tagRoles).forEach(([tag, role]) => {
    roles[tag] = role === 'hub' ? 'hub' : 'leaf';
  });
  
  // Group hub nodes into clusters based on co-occurrence
  const hubClusters: string[][] = [];
  const processedHubs = new Set<string>();
  
  const hubNodes = Object.keys(roles).filter(tag => roles[tag] === 'hub');
  
  hubNodes.forEach(hub => {
    if (processedHubs.has(hub)) return;
    
    // Find all hubs connected to this one
    const cluster = [hub];
    processedHubs.add(hub);
    
    const findConnectedHubs = (currentHub: string) => {
      postAnalysis.hubConnections.forEach(({ source, target }) => {
        const connectedHub = source === currentHub ? target : 
                           target === currentHub ? source : null;
        
        if (connectedHub && !processedHubs.has(connectedHub) && roles[connectedHub] === 'hub') {
          cluster.push(connectedHub);
          processedHubs.add(connectedHub);
          findConnectedHubs(connectedHub);
        }
      });
    };
    
    findConnectedHubs(hub);
    hubClusters.push(cluster);
  });
  
  // Select ambassador nodes from each cluster
  hubClusters.forEach(cluster => {
    if (cluster.length === 1) {
      // Single hub in cluster becomes ambassador
      roles[cluster[0]] = 'ambassador';
    } else {
      // Multiple hubs: select ambassador based on frequency, then alphabetical
      const clusterWithCounts = cluster.map(tag => ({
        tag,
        count: tagCounts[tag] || 0
      }));
      
      const maxCount = Math.max(...clusterWithCounts.map(c => c.count));
      const candidates = clusterWithCounts.filter(c => c.count === maxCount);
      
      if (candidates.length === 1) {
        roles[candidates[0].tag] = 'ambassador';
      } else {
        // Tie-breaker: alphabetical order
        const sorted = candidates.sort((a, b) => a.tag.localeCompare(b.tag));
        roles[sorted[0].tag] = 'ambassador';
      }
    }
  });
  
  return roles;
};

export const createTagGraphData = (
  tagGraphData: LocaleTagGraphData | undefined,
  t: (key: string) => string,
  locale: string
): GraphData => {
  if (!tagGraphData) return { nodes: [], links: [] };

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Filter out empty tags before processing
  const validTagCounts = Object.fromEntries(
    Object.entries(tagGraphData.tagCounts || {}).filter(([tag]) => tag !== '')
  );
  const tagCounts = validTagCounts;
  const totalTags = Object.keys(tagCounts).length;

  // Create the 'All Tags' node (Root)
  const allTagsNodeName = t('allTags');
  const allTagsNode: GraphNode = {
    id: ALL_TAGS_NODE_ID,
    name: allTagsNodeName,
    type: 'Root' as any,
    url: `/${locale}/all-tags`,
    color: '#059669',
    val: calculateNodeSize(totalTags),
    count: totalTags,
  };
  nodes.push(allTagsNode);

  // Step 1: Analyze tags within each post to classify as hub or leaf
  const postTagAnalysis = analyzePostLevelTags(tagGraphData, locale);
  
  // Step 2: Determine global tag roles (ambassador/hub/leaf)
  const tagRoles = determineTagRoles(tagCounts, postTagAnalysis);
  
  // Step 3: Create nodes based on roles
  const ambassadorNodes: GraphNode[] = [];
  const hubNodes: GraphNode[] = [];
  const leafNodes: GraphNode[] = [];

  Object.entries(tagCounts).forEach(([tag, count]) => {
    const role = tagRoles[tag];
    const baseNode = {
      id: tag,
      name: tag,
      url: `/${locale}/tag/${encodeURIComponent(tag)}`,
      color: getNodeColor(role),
      val: calculateNodeSize(count),
    };

    switch (role) {
      case 'ambassador':
        ambassadorNodes.push({
          ...baseNode,
          type: 'Ambassador' as any,
          count: count,
        });
        break;
      case 'hub':
        hubNodes.push({
          ...baseNode,
          type: 'Hub' as any,
          count: count,
        });
        break;
      case 'leaf':
        leafNodes.push({
          ...baseNode,
          type: 'Leaf' as any,
          // Leaf nodes don't show frequency count
        });
        break;
    }
  });

  // Add all nodes to the final array
  nodes.push(...ambassadorNodes, ...hubNodes, ...leafNodes);

  // Step 4: Create connections based on the new rules
  const validNodeIds = new Set(nodes.map(n => n.id));
  
  // Connect ambassador nodes to root
  ambassadorNodes.forEach(node => {
    if (validNodeIds.has(ALL_TAGS_NODE_ID) && validNodeIds.has(node.id)) {
      links.push({
        source: ALL_TAGS_NODE_ID,
        target: node.id,
        color: '#D1D5DB',
        width: 2,
      });
    }
  });

  // Connect leaf nodes to their hub/ambassador nodes
  leafNodes.forEach(leafNode => {
    const parentTags = postTagAnalysis.leafToHubMap[leafNode.id] || [];
    parentTags.forEach(parentTag => {
      if (validNodeIds.has(parentTag) && validNodeIds.has(leafNode.id)) {
        links.push({
          source: parentTag,
          target: leafNode.id,
          color: '#E5E7EB',
          width: 1,
        });
      }
    });
  });

  // Connect hub nodes to each other within posts
  postTagAnalysis.hubConnections.forEach(({ source, target }) => {
    if (validNodeIds.has(source) && validNodeIds.has(target)) {
      links.push({
        source,
        target,
        color: '#9CA3AF',
        width: 1.5,
      });
    }
  });

  return { nodes, links };
};

export const cleanupImageCache = () => {
  imageCache.clear();
};

// Memoization cache for processed data
const dataCache = new Map<string, GraphData>();

export const getCachedGraphData = (
  key: string,
  generator: () => GraphData
): GraphData => {
  if (dataCache.has(key)) {
    return dataCache.get(key)!;
  }
  
  const data = generator();
  dataCache.set(key, data);
  return data;
};

export const invalidateDataCache = () => {
  dataCache.clear();
};
