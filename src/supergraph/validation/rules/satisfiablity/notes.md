# NOTES

When moving from Node to Node I will basically check if I can satisfy an Edge. Edge can have an
attached a Move. Node is always bound to a Type and a Graph. Edge can have different head and tail
nodes. We want to merge all subgraphs into one graph.

To build all possible graphs we need to start from the root nodes and then traverse the graph. We
can do it in two ways:

- breadth-first search (https://en.wikipedia.org/wiki/Breadth-first_search) - memory consuming, but
  sometimes faster
- depth-first search (https://en.wikipedia.org/wiki/Depth-first_search) - memory efficient, but can
  be slow

https://en.wikipedia.org/wiki/Shortest_path_problem https://en.wikipedia.org/wiki/Directed_graph
https://en.wikipedia.org/wiki/Connectivity_(graph_theory) https://en.wikipedia.org/wiki/Rooted_graph

Future possible optimization: First, go as deep as possible using direct paths, but move back to
indirect paths if we fail.

The initial algorithm was very inefficient. It all started with a part where it tried to find all
possible paths and validate them, but it was very slow. I thought that the performance problem was
cause by the fact that it was checking the same paths multiple times and I tried to optimize it by
using a cache, but it didn't help.

I had to change the approach and I decided to start from the root nodes and traverse the graph. The
problem was that I had to find a way to traverse the graph, but there were no single Nodes and
Edges, they were "duplicated" for each subgraph. Instead of following this approach I decided to
build a single graph that would contain all reachable (from the root types) Nodes and Edges
representing not all subgraphs but the Supergraph. This way I could traverse the graph, Node by
Node, Edge by Edge and find all possible paths and validate them.

I decided to use a Depth-first search to move from Node to Node, to reduce the memory footprint of
storing all the paths from all the edges of a Node in memory. To validate the algorithm I used, I
decided to implement a Breadth-first search as well and compare the results. That's why
ADVANCE_METHOD is an environment variable that can be set to "bfs" or "dfs", to switch between the
two methods and compare the results.

We could use Dijkstra's algorithm or A\* to optimize it even further, but it's not necessary at the
moment.

The algorithm still had a big performance problem. It was cause by the fact that it was visiting the
same Node over and over again and checking its edges. I couldn't simply mark the Node as
visited/resolvable, because it could be visited from different paths and potentially even with
@provides(fields). What I did was to store a list of graphs we directly moved from to the Node and
include @provided fields in the list. This way I could check if Node was already visited from the
same combination of graphs and @provides fields and skip it if it was. It improved the performance
significantly. I'm still not sure if it's solid approach, but it works for now and I haven't seen
any problems with it (yet).

About @provides(fields). The whole idea of @provides(fields) is that if a user hits this field, the
underlying path will already have the fields resolved. I had to implement something for it, so I
decide to use the graph structure and simply create a new Node and Edge for each provided field.
This way I could simply traverse the graph without keeping in memory that the query path contains
provided fields. It felt natural and it worked well.

During the development I had to deal with infinite loops not only when traversing the graph (moving
from Node to Node at supergraph level) but especially when checking if @requires(fields) or
@key(fields) can be satisfied. It was a nightmare to deal with it, but I managed to solve it by
using a list of visited graphs and edges.
