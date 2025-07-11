import { useEffect, useState } from "react";
    import { supabase } from "@/lib/supabase";
    import {
      fetchCryptoPrices,
      fetchHistoricalPrice,
      SYMBOL_TO_GECKO_ID_MAP,
    } from "@/lib/cryptoApi";
    import {
      Card,
      CardHeader,
      CardTitle,
      CardContent,
      CardDescription,
    } from "@/components/ui/card";
    import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
    import {
      Table,
      TableHeader,
      TableBody,
      TableHead,
      TableRow,
      TableCell,
    } from "@/components/ui/table";
    import {
      AlertTriangle,
      ArrowUpRight,
      ArrowDownRight,
    } from "lucide-react";
    import { PieChart } from "@mui/x-charts/PieChart";
    import { cn } from "@/lib/utils";
    import { Separator } from "@/components/ui/separator";

    interface PortfolioMetrics {
      totalValue: number;
      cashBalance: number;
      investedValue: number;
      pnlUsd: number;
      pnlPercent: number;
      todaysPnlUsd: number;
      todaysPnlPercent: number;
    }

    interface OpenPosition {
      asset: string;
      quantityHeld: number;
      pnl: number;
      marketValue: number;
      pnlPercent: number;
      twentyFourHourChange: number;
      livePrice: number;
    }

    interface ClientOwnership {
      name: string;
      ownershipPercentage: number;
      equityValue: number;
      pnl: number;
    }

    // A simplified transaction type for our logic
    type Transaction = {
      transaction_type: "DEPOSIT" | "WITHDRAWAL" | "BUY" | "SELL";
      transaction_value_usd: number;
      asset?: string | null;
      asset_quantity?: number | null;
    };

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    };

    const formatQuantity = (value: number) => {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(value);
    };

    const SkeletonCard = ({ title, lines = 2 }: { title: string, lines?: number }) => (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="mb-3">
              <div className="h-5 w-3/4 bg-gray-200/20 rounded animate-pulse dark:bg-gray-700/20 mb-2"></div>
              <div className="h-4 w-1/2 bg-gray-200/20 rounded animate-pulse dark:bg-gray-700/20"></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );

    export default function Dashboard() {
      const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
      const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
      const [clientOwnership, setClientOwnership] = useState<ClientOwnership[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      useEffect(() => {
        const calculateMetrics = async () => {
          setLoading(true);
          setError(null);

          try {
            const { data: transactions, error: txError } = await supabase
              .from("transactions")
              .select("transaction_type, transaction_value_usd, asset, asset_quantity");

            if (txError) throw txError;
            if (!transactions) throw new Error("No transactions found.");

            // --- Aggregation for Calculations ---
            const assetPortfolios: Record<string, { quantity: number; totalCost: number }> = {};
            let cashBalance = 0;
            const uniqueAssetIds = new Set<string>();

            for (const tx of transactions as Transaction[]) {
              const { transaction_type, asset, asset_quantity, transaction_value_usd } = tx;

              switch (transaction_type) {
                case "DEPOSIT": cashBalance += transaction_value_usd; break;
                case "WITHDRAWAL": cashBalance -= transaction_value_usd; break;
                case "BUY": cashBalance -= transaction_value_usd; break;
                case "SELL": cashBalance += transaction_value_usd; break;
              }

              if (asset && asset_quantity && asset_quantity > 0) {
                uniqueAssetIds.add(asset);
                if (!assetPortfolios[asset]) assetPortfolios[asset] = { quantity: 0, totalCost: 0 };
                
                if (transaction_type === "BUY") {
                  assetPortfolios[asset].quantity += asset_quantity;
                  assetPortfolios[asset].totalCost += transaction_value_usd;
                } else if (transaction_type === "SELL") {
                  const portfolio = assetPortfolios[asset];
                  if (portfolio && portfolio.quantity > 0) {
                    const costOfSoldAssets = (portfolio.totalCost / portfolio.quantity) * asset_quantity;
                    portfolio.totalCost -= costOfSoldAssets;
                    portfolio.quantity -= asset_quantity;
                  }
                }
              }
            }

            const assetIdsToFetch = Array.from(uniqueAssetIds);
            const prices = await fetchCryptoPrices(assetIdsToFetch);

            // --- UNIFIED P&amp;L CALCULATION ---
            const positions: OpenPosition[] = [];
            for (const asset in assetPortfolios) {
              const portfolio = assetPortfolios[asset];
              const quantityHeld = portfolio.quantity;

              if (quantityHeld > 1e-9) {
                const costBasis = portfolio.totalCost;
                const livePrice = prices[asset]?.usd || 0;
                const twentyFourHourChange = prices[asset]?.usd_24h_change || 0;
                const marketValue = quantityHeld * livePrice;
                const pnl = marketValue - costBasis;
                const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                
                positions.push({ asset, quantityHeld, pnl, marketValue, pnlPercent, twentyFourHourChange, livePrice });
              }
            }
            setOpenPositions(positions.sort((a, b) => b.marketValue - a.marketValue));

            const totalMarketValue = positions.reduce((acc, pos) => acc + pos.marketValue, 0);
            const totalPnlUsd = positions.reduce((acc, pos) => acc + pos.pnl, 0);
            const totalCostBasis = positions.reduce((acc, pos) => acc + (pos.marketValue - pos.pnl), 0);
            const totalPortfolioValue = totalMarketValue + cashBalance;
            const pnlPercent = totalCostBasis > 0 ? (totalPnlUsd / totalCostBasis) * 100 : 0;

            // --- Today's P&amp;L Calculation ---
            const today = new Date();
            const dateString = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

            const historicalPricePromises = positions.map(pos => {
              const coingeckoId = SYMBOL_TO_GECKO_ID_MAP[pos.asset.toUpperCase()];
              if (!coingeckoId) return Promise.resolve(null);
              return fetchHistoricalPrice(coingeckoId, dateString);
            });

            const historicalPrices = await Promise.all(historicalPricePromises);

            let startOfDayMarketValue = 0;
            historicalPrices.forEach((price, index) => {
              const position = positions[index];
              if (price !== null) {
                startOfDayMarketValue += position.quantityHeld * price;
              } else {
                // Fallback: Use 24h change to estimate start-of-day price if historical API fails.
                const livePrice = position.livePrice;
                const changePercent = position.twentyFourHourChange / 100;
                const startOfDayPrice = livePrice / (1 + changePercent);
                startOfDayMarketValue += position.quantityHeld * startOfDayPrice;
              }
            });

            const startOfDayPortfolioValue = startOfDayMarketValue + cashBalance;
            const todaysPnlUsd = totalPortfolioValue - startOfDayPortfolioValue;
            const todaysPnlPercent = startOfDayPortfolioValue > 0 ? (todaysPnlUsd / startOfDayPortfolioValue) * 100 : 0;

            setMetrics({
              totalValue: totalPortfolioValue,
              cashBalance: cashBalance,
              investedValue: totalMarketValue,
              pnlUsd: totalPnlUsd,
              pnlPercent: pnlPercent,
              todaysPnlUsd: todaysPnlUsd,
              todaysPnlPercent: todaysPnlPercent,
            });

            // --- Client Ownership Calculation ---
            const { data: profiles, error: profilesError } = await supabase
              .from("profiles")
              .select("name, total_deposited_usd");

            if (profilesError) throw profilesError;
            if (!profiles) throw new Error("No client profiles found.");

            const totalCapitalInvested = profiles.reduce(
              (acc, p) => acc + (p.total_deposited_usd || 0),
              0
            );

            if (totalCapitalInvested > 0) {
              const ownershipData = profiles
                .map((profile) => {
                  const name = profile.name || "Unnamed Client";
                  const deposited = profile.total_deposited_usd || 0;

                  const ownershipPercentage = (deposited / totalCapitalInvested) * 100;
                  const equityValue = totalPortfolioValue * (ownershipPercentage / 100);
                  const pnl = equityValue - deposited;

                  return { name, ownershipPercentage, equityValue, pnl };
                })
                .sort((a, b) => b.equityValue - a.equityValue);

              setClientOwnership(ownershipData);
            }

          } catch (err) {
            console.error("Error calculating dashboard metrics:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
          } finally {
            setLoading(false);
          }
        };

        calculateMetrics();
      }, []);

      if (loading) {
        return (
          <div className="pt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <SkeletonCard title="Total Portfolio Value" lines={1} />
              <SkeletonCard title="Unrealized P&amp;L (Overall)" lines={2} />
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-1 lg:grid-cols-3">
              <SkeletonCard title="Current Holdings" lines={3} />
              <SkeletonCard title="Performance" lines={3} />
              <SkeletonCard title="Coin Tracker" lines={3} />
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
              <SkeletonCard title="Client Ownership" lines={4} />
              <SkeletonCard title="Asset Allocation" lines={4} />
            </div>
          </div>
        );
      }

      if (error) {
        return (
          <div className="pt-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to Load Dashboard</AlertTitle>
              <AlertDescription>
                Could not calculate portfolio metrics. Please ensure the database is reachable and transactions are correctly formatted.
                <br />
                <code className="text-xs mt-2 block bg-red-900/20 p-2 rounded">{error}</code>
              </AlertDescription>
            </Alert>
          </div>
        );
      }

      if (!metrics) return null;

      const isPnlPositive = metrics.pnlUsd >= 0;
      const isTodaysPnlPositive = metrics.todaysPnlUsd >= 0;

      const totalAssetValueForChart = openPositions.reduce((sum, pos) => sum + pos.marketValue, 0);
      const pieChartData = openPositions.map((pos) => ({
        id: pos.asset,
        value: totalAssetValueForChart > 0 ? (pos.marketValue / totalAssetValueForChart) * 100 : 0,
        label: pos.asset,
      }));

      return (
        <div className="pt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Total Portfolio Value</CardTitle>
                <CardDescription>
                  Current value of all crypto and cash holdings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold tracking-tighter text-gray-100">
                  {formatCurrency(metrics.totalValue)}
                </p>
                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Cash:</span>
                    <span className="font-medium text-gray-300">{formatCurrency(metrics.cashBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Invested:</span>
                    <span className="font-medium text-gray-300">{formatCurrency(metrics.investedValue)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Unrealized P&amp;L</CardTitle>
                <CardDescription>
                  All-time and daily profit or loss on open positions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-around">
                  {/* Left Column: All-Time P&L */}
                  <div className="flex flex-col items-center space-y-1">
                    <p className="text-sm text-muted-foreground">All-Time</p>
                    <p
                      className={cn(
                        "text-2xl font-bold tracking-tighter",
                        isPnlPositive ? "text-positive" : "text-negative"
                      )}
                    >
                      {formatCurrency(metrics.pnlUsd)}
                    </p>
                    <div
                      className={cn(
                        "flex items-center text-sm font-medium",
                        isPnlPositive ? "text-positive" : "text-negative"
                      )}
                    >
                      {isPnlPositive ? (
                        <ArrowUpRight className="h-4 w-4 mr-1" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 mr-1" />
                      )}
                      {metrics.pnlPercent.toFixed(2)}%
                    </div>
                  </div>

                  <Separator orientation="vertical" className="h-16 bg-border/50" />

                  {/* Right Column: Today's P&L */}
                  <div className="flex flex-col items-center space-y-1">
                    <p className="text-sm text-muted-foreground">Today's P&amp;L</p>
                    <p
                      className={cn(
                        "text-2xl font-bold tracking-tighter",
                        isTodaysPnlPositive ? "text-positive" : "text-negative"
                      )}
                    >
                      {formatCurrency(metrics.todaysPnlUsd)}
                    </p>
                    <div
                      className={cn(
                        "flex items-center text-sm font-medium",
                        isTodaysPnlPositive ? "text-positive" : "text-negative"
                      )}
                    >
                      {isTodaysPnlPositive ? (
                        <ArrowUpRight className="h-4 w-4 mr-1" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 mr-1" />
                      )}
                      {metrics.todaysPnlPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-1 lg:grid-cols-3">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Current Holdings</CardTitle>
                <CardDescription>
                  Summary of all crypto assets currently held.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openPositions.length > 0 ? (
                      openPositions.map((pos) => (
                        <TableRow key={pos.asset}>
                          <TableCell className="font-medium">{pos.asset}</TableCell>
                          <TableCell className="text-right">{formatQuantity(pos.quantityHeld)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(pos.marketValue)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          No open positions found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Performance</CardTitle>
                <CardDescription>
                  Unrealized P&amp;L of currently held assets.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">$</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openPositions.length > 0 ? (
                      openPositions.map((pos) => (
                        <TableRow key={pos.asset}>
                          <TableCell className="font-medium">{pos.asset}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              pos.pnl >= 0 ? "text-positive" : "text-negative"
                            )}
                          >
                            {pos.pnl >= 0 ? '+' : ''}{formatCurrency(pos.pnl)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              pos.pnl >= 0 ? "text-positive" : "text-negative"
                            )}
                          >
                            {typeof pos.pnlPercent === 'number'
                              ? `${pos.pnl >= 0 ? '+' : ''}${pos.pnlPercent.toFixed(2)}%`
                              : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          No open positions to analyze.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Coin Tracker</CardTitle>
                <CardDescription>
                  Up-to-date information of assets held.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Current Price</TableHead>
                      <TableHead className="text-right">24h Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openPositions.length > 0 ? (
                      openPositions.map((pos) => (
                        <TableRow key={pos.asset}>
                          <TableCell className="font-medium">{pos.asset}</TableCell>
                          <TableCell className="text-right">{formatCurrency(pos.livePrice)}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              pos.twentyFourHourChange >= 0 ? "text-positive" : "text-negative"
                            )}
                          >
                            {pos.twentyFourHourChange >= 0 ? '+' : ''}{pos.twentyFourHourChange.toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          No assets to track.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Client Ownership</CardTitle>
                <CardDescription>
                  Breakdown of each client's equity and performance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client Name</TableHead>
                      <TableHead className="text-right">Ownership</TableHead>
                      <TableHead className="text-right">Equity Value</TableHead>
                      <TableHead className="text-right">P&amp;L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientOwnership.length > 0 ? (
                      clientOwnership.map((client) => (
                        <TableRow key={client.name}>
                          <TableCell className="font-medium">{client.name}</TableCell>
                          <TableCell className="text-right">{client.ownershipPercentage.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{formatCurrency(client.equityValue)}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              client.pnl >= 0 ? "text-positive" : "text-negative"
                            )}
                          >
                            {client.pnl >= 0 ? '+' : ''}{formatCurrency(client.pnl)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          No client data available to calculate ownership.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Asset Allocation</CardTitle>
                <CardDescription>
                  Distribution of crypto assets by market value.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pieChartData.length > 0 ? (
                  <PieChart
                    colors={['#03045E', '#023E8A', '#0077B6', '#0096C7', '#00B4D8', '#48CAE4', '#90E0EF', '#ADE8F4']}
                    series={[
                      {
                        data: pieChartData,
                        highlightScope: { faded: 'global', highlighted: 'item' },
                        faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
                        innerRadius: 40,
                        outerRadius: 96,
                        paddingAngle: 5,
                        cornerRadius: 5,
                        startAngle: -90,
                        endAngle: 270,
                        valueFormatter: (item) => `${item.value.toFixed(1)}%`,
                      },
                    ]}
                    height={300}
                    slotProps={{
                      legend: { hidden: true },
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No assets to display in chart.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
