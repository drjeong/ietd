class AnnnualPCAPlot extends FloatingBootboxChart {
    constructor(containerId, IETDhour, IETDData, IETDHPCPStations) {
        super(containerId);

        this.containerId = containerId;
        this.IETDhour = IETDhour;
        this.IETDData = IETDData;
        this.IETDHPCPStations = IETDHPCPStations;
        this.margin = { top: 20, right: 20, bottom: 50, left: 60 };
        this.title = "Annual PCA Analysis";
        this.symbolSize = 30;  // Define symbol size as a class property

        // Get container dimensions
        const container = d3.select(`#${this.containerId}`);
        this.width = parseInt(container.style('width'));
        this.height = parseInt(container.style('height'));
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        // Add these new properties
        this.selectedPoints = new Set(); // Store selected points
        this.persistentTooltips = new Map(); // Store persistent tooltips

        // Color scale for years
        this.determineYearColorScale();

        this.computedFeatures = {}; // Will store features by station_id and year

        // Create station color scale
        const stations = Object.keys(this.IETDData);
        this.stationColorScale = d3.scaleOrdinal(d3.schemeDark2)
            .domain(stations);

        // Bind methods
        this.resize = this.resize.bind(this);
        this.processData = this.processData.bind(this);


        // Initialize
        this.processData();
        this.initialize();

        // Apply styles directly to elements
        this.mainGroup.selectAll(".point-label, .temp-year-label, .label-connector")
            .style("pointer-events", "none");
    }

    formatStationInfoTooltip(stationObj) {
        let parts = [];
        parts.push(`ID: ${stationObj.id}`);
        if (stationObj.FAA_ID !== null) {
            parts.push(`FAA: ${stationObj.FAA_ID}`);
        }
        if (stationObj.NCDC_ID !== null) {
            parts.push(`NCDC: ${stationObj.NCDC_ID}`);
        }
        if (stationObj.GHCND_ID !== null) {
            parts.push(`GHCND: ${stationObj.GHCND_ID}`);
        }
        if (stationObj.COOP_ID !== null) {
            parts.push(`COOP: ${stationObj.COOP_ID}`);
        }
        return parts.join('<br>'); // Use line breaks for better readability in tooltip
    }

    determineYearColorScale() {
        try {
            // Extract years from IETDData
            const years = [...new Set(
                Object.values(this.IETDData)
                    .flatMap(stationData =>
                        stationData.map(d => new Date(d.dateFrom).getFullYear())
                    )
                    .filter(year => !isNaN(year))
            )];

            if (years.length === 0) {
                console.warn('No valid years found in IETD data');
                this.yearColorScale = d3.scaleSequential(d3.interpolateViridis)
                    .domain([2000, 2025]); // fallback domain
                return;
            }

            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);

            this.yearColorScale = d3.scaleSequential(d3.interpolateViridis)
                .domain([minYear, maxYear]);

        } catch (error) {
            console.error('Error creating color scale:', error);
            this.yearColorScale = d3.scaleSequential(d3.interpolateViridis)
                .domain([2000, 2025]); // fallback domain
        }
    }

    createSvg() {
        d3.select(`#${this.containerId}`).select("svg").remove();

        this.svg = d3.select(`#${this.containerId}`)
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height);

        this.createTooltip();
    }

    createTooltip() {
        // Create persistent tooltip with higher z-index and absolute positioning

        if (!this.tooltip) {
            this.tooltip = d3.select("body")
                .append("div")
                .attr("class", "annualpca-tooltip")
                .attr("color", "black")
                .style("position", "fixed")  // Change to fixed positioning
                .style("z-index", "999999")  // Very high z-index to appear above modal
                .style("visibility", "hidden")
                .style("background", "#fff")
                .style("padding", "5px")
                .style("border", "1px solid #000")
                .style("border-radius", "3px")
                .style("pointer-events", "none")
                .style("font-family", "Arial")
                .style("font-size", "11px");
        }
    }

    initialize() {
        // Create SVG and tooltip
        this.createSvg();
        this.createScales();
        this.createAxes();
        this.createVisualization();

        window.addEventListener('resize', () => this.resize());
    }

    processData() {
        try {
            this.formattedPCAData = {};

            // Process each station separately
            Object.entries(this.IETDData).forEach(([station_id, stationData]) => {
                // Group data by year for this station
                const yearlyData = d3.group(stationData,
                    d => new Date(d.dateFrom).getFullYear());

                // Initialize this station's feature storage
                this.computedFeatures[station_id] = {};

                // Calculate features for PCA for this station with seasonal breakdown
                const featuresData = Array.from(yearlyData, ([year, events]) => {
                    // Define seasons (meteorological seasons)
                    const seasons = {
                        winter: [12, 1, 2],    // December, January, February
                        spring: [3, 4, 5],     // March, April, May
                        summer: [6, 7, 8],     // June, July, August
                        fall: [9, 10, 11]      // September, October, November
                    };

                    // Group events by season
                    const seasonalEvents = {
                        winter: [],
                        spring: [],
                        summer: [],
                        fall: []
                    };

                    events.forEach(event => {
                        const month = new Date(event.dateFrom).getMonth() + 1; // 1-12

                        if (seasons.winter.includes(month)) seasonalEvents.winter.push(event);
                        else if (seasons.spring.includes(month)) seasonalEvents.spring.push(event);
                        else if (seasons.summer.includes(month)) seasonalEvents.summer.push(event);
                        else if (seasons.fall.includes(month)) seasonalEvents.fall.push(event);
                    });

                    // Calculate base metrics for all events
                    const volumes = events.map(e => e.volume);
                    const durations = events.map(e => {
                        const from = new Date(e.dateFrom);
                        const to = new Date(e.dateTo);
                        return (to - from) / (1000 * 60 * 60); // Duration in hours
                    });
                    const intensities = events.map((e, i) => {
                        // Avoid division by zero
                        if (durations[i] <= 0) {
                            return 0; // or some appropriate default value
                        }
                        return volumes[i] / durations[i];
                    });
                    const totalAnnualPrecipitation = d3.sum(volumes) || 0;

                    // Function to calculate seasonal metrics
                    const calculateSeasonalMetrics = (seasonEvents) => {
                        if (seasonEvents.length === 0) {
                            return [0, 0, 0, 0, 0, 0, 0, 0];
                        }

                        const seasonVolumes = seasonEvents.map(e => e.volume);
                        const seasonDurations = seasonEvents.map(e => {
                            const from = new Date(e.dateFrom);
                            const to = new Date(e.dateTo);
                            return (to - from) / (1000 * 60 * 60);
                        });
                        const seasonIntensities = seasonEvents.map((e, i) => {
                            // Avoid division by zero
                            if (seasonDurations[i] <= 0) {
                                return 0; // or some appropriate default value
                            }
                            return seasonVolumes[i] / seasonDurations[i];
                        });

                        return [
                            d3.mean(seasonVolumes) || 0,                // Mean volume
                            d3.deviation(seasonVolumes) || 0,           // Volume SD
                            d3.mean(seasonDurations) || 0,              // Mean duration
                            d3.deviation(seasonDurations) || 0,         // Duration SD
                            d3.mean(seasonIntensities) || 0,            // Mean intensity
                            d3.max(seasonVolumes) || 0,                 // Max event
                            seasonEvents.length,                        // Event count
                            d3.sum(seasonVolumes) || 0                  // Total precipitation
                        ];
                    };

                    // Calculate metrics for each season
                    const winterMetrics = calculateSeasonalMetrics(seasonalEvents.winter);
                    const springMetrics = calculateSeasonalMetrics(seasonalEvents.spring);
                    const summerMetrics = calculateSeasonalMetrics(seasonalEvents.summer);
                    const fallMetrics = calculateSeasonalMetrics(seasonalEvents.fall);

                    // Calculate seasonal totals
                    const winterTotal = winterMetrics[7];  // Total winter precipitation
                    const springTotal = springMetrics[7];  // Total spring precipitation
                    const summerTotal = summerMetrics[7];  // Total summer precipitation
                    const fallTotal = fallMetrics[7];      // Total fall precipitation

                    // Calculate seasonal proportions safely
                    const winterProportion = totalAnnualPrecipitation > 0 ? winterTotal / totalAnnualPrecipitation : 0;
                    const springProportion = totalAnnualPrecipitation > 0 ? springTotal / totalAnnualPrecipitation : 0;
                    const summerProportion = totalAnnualPrecipitation > 0 ? summerTotal / totalAnnualPrecipitation : 0;
                    const fallProportion = totalAnnualPrecipitation > 0 ? fallTotal / totalAnnualPrecipitation : 0;

                    // Calculate seasonal variability safely
                    const seasonalTotals = [winterTotal, springTotal, summerTotal, fallTotal];
                    const seasonalMean = d3.mean(seasonalTotals) || 1; // Use 1 to avoid division by zero

                    const seasonalVariability = totalAnnualPrecipitation > 0 && seasonalMean > 0 ?
                        (d3.deviation(seasonalTotals) || 0) / seasonalMean : 0;

                    // Store the computed features for this station and year
                    this.computedFeatures[station_id][year] = {
                        // Annual metrics
                        meanVolume: d3.mean(volumes) || 0,
                        volumeSD: d3.deviation(volumes) || 0,
                        meanDuration: d3.mean(durations) || 0,
                        durationSD: d3.deviation(durations) || 0,
                        maxVolume: d3.max(volumes) || 0,
                        eventCount: events.length,
                        totalPrecipitation: totalAnnualPrecipitation,
                        meanIntensity: d3.mean(intensities) || 0,

                        // Seasonal metrics
                        winter: {
                            meanVolume: winterMetrics[0],
                            volumeSD: winterMetrics[1],
                            meanDuration: winterMetrics[2],
                            durationSD: winterMetrics[3],
                            meanIntensity: winterMetrics[4],
                            maxVolume: winterMetrics[5],
                            eventCount: winterMetrics[6],
                            totalPrecipitation: winterMetrics[7]
                        },
                        spring: {
                            meanVolume: springMetrics[0],
                            volumeSD: springMetrics[1],
                            meanDuration: springMetrics[2],
                            durationSD: springMetrics[3],
                            meanIntensity: springMetrics[4],
                            maxVolume: springMetrics[5],
                            eventCount: springMetrics[6],
                            totalPrecipitation: springMetrics[7]
                        },
                        summer: {
                            meanVolume: summerMetrics[0],
                            volumeSD: summerMetrics[1],
                            meanDuration: summerMetrics[2],
                            durationSD: summerMetrics[3],
                            meanIntensity: summerMetrics[4],
                            maxVolume: summerMetrics[5],
                            eventCount: summerMetrics[6],
                            totalPrecipitation: summerMetrics[7]
                        },
                        fall: {
                            meanVolume: fallMetrics[0],
                            volumeSD: fallMetrics[1],
                            meanDuration: fallMetrics[2],
                            durationSD: fallMetrics[3],
                            meanIntensity: fallMetrics[4],
                            maxVolume: fallMetrics[5],
                            eventCount: fallMetrics[6],
                            totalPrecipitation: fallMetrics[7]
                        },

                        // Seasonal proportions
                        seasonalProportions: {
                            winter: winterProportion,
                            spring: springProportion,
                            summer: summerProportion,
                            fall: fallProportion
                        },

                        seasonalVariability: seasonalVariability
                    };


                    return {
                        year: parseInt(year),
                        station_id: station_id,
                        features: [
                            // Annual metrics
                            d3.mean(volumes) || 0,                      // Mean precipitation volume
                            d3.deviation(volumes) || 0,                 // Standard deviation of volumes
                            d3.mean(durations) || 0,                    // Mean event duration
                            d3.deviation(durations) || 0,               // Standard deviation of durations
                            d3.max(volumes) || 0,                       // Maximum precipitation event
                            events.length,                              // Number of precipitation events
                            totalAnnualPrecipitation,                   // Total annual precipitation
                            d3.mean(intensities) || 0,                  // Mean precipitation intensity

                            // Winter metrics
                            ...winterMetrics,

                            // Spring metrics
                            ...springMetrics,

                            // Summer metrics
                            ...summerMetrics,

                            // Fall metrics
                            ...fallMetrics,

                            // Seasonal distribution metrics
                            winterProportion,                           // Winter precipitation proportion
                            springProportion,                           // Spring precipitation proportion
                            summerProportion,                           // Summer precipitation proportion
                            fallProportion,                             // Fall precipitation proportion

                            // Seasonal variability (coefficient of variation across seasons)
                            seasonalVariability
                        ]
                    };
                });

                // Standardize features for this station
                // Update your standardization step with robust handling of edge cases
                const features = featuresData.map(d => d.features);

                // 1. First, clean the features array by replacing NaN and Infinity values
                const cleanedFeatures = features.map(row =>
                    row.map(val => {
                        // Replace NaN and Infinity with 0
                        if (isNaN(val) || !isFinite(val)) {
                            return 0;
                        }
                        return val;
                    })
                );

                // 2. Compute means more robustly
                const means = cleanedFeatures[0].map((_, i) => {
                    const validValues = cleanedFeatures
                        .map(row => row[i])
                        .filter(val => !isNaN(val) && isFinite(val));

                    // If no valid values, return 0
                    if (validValues.length === 0) {
                        return 0;
                    }

                    return d3.mean(validValues);
                });

                // 3. Compute standard deviations more robustly
                const stds = cleanedFeatures[0].map((_, i) => {
                    const validValues = cleanedFeatures
                        .map(row => row[i])
                        .filter(val => !isNaN(val) && isFinite(val));

                    // If no valid values or only one value (can't compute std dev), return 1
                    if (validValues.length <= 1) {
                        return 1;
                    }

                    const stdDev = d3.deviation(validValues);

                    // If std dev is 0 (all values identical), return 1 to avoid division by zero
                    return stdDev === 0 ? 1 : stdDev;
                });

                // 4. Perform standardization with additional validation
                const standardizedFeatures = cleanedFeatures.map(row =>
                    row.map((val, i) => {
                        // Handle the case where val is NaN or Infinity
                        if (isNaN(val) || !isFinite(val)) {
                            return 0; // Replace with 0 (mean after standardization)
                        }

                        // Standard standardization formula
                        return (val - means[i]) / stds[i];
                    })
                );


                // Before running PCA, validate that there are no NaN or Infinity values
                const validatedFeatures = standardizedFeatures.map(row =>
                    row.map(val => {
                        if (isNaN(val) || !isFinite(val)) {
                            console.warn("Found invalid value after standardization:", val);
                            return 0; // Replace with 0
                        }
                        return val;
                    })
                );

                // Check for constant features (zero variance after standardization)
                // These features can cause problems in PCA
                const featureVariances = validatedFeatures[0].map((_, i) => {
                    const values = validatedFeatures.map(row => row[i]);
                    const variance = d3.variance(values);
                    return variance;
                });

                // Log any near-zero variance features
                featureVariances.forEach((variance, i) => {
                    if (variance < 1e-10) {
                        console.warn(`Feature ${i} has near-zero variance after standardization`);
                    }
                });

                // Now perform PCA on validatedFeatures
                const pca = this.performPCA(validatedFeatures);

                // Project data onto first two principal components
                this.formattedPCAData[station_id] = featuresData.map((d, i) => ({
                    year: d.year,
                    station_id: station_id,
                    x: pca.projections[i][0],
                    y: pca.projections[i][1]
                })).sort((a, b) => a.year - b.year);
            });

            // Calculate overall axis ranges across all stations
            const allPoints = Object.values(this.formattedPCAData).flat();
            this.xExtent = d3.extent(allPoints, d => d.x);
            this.yExtent = d3.extent(allPoints, d => d.y);

            // Add some padding to the extents
            const xPadding = (this.xExtent[1] - this.xExtent[0]) * 0.1;
            const yPadding = (this.yExtent[1] - this.yExtent[0]) * 0.1;
            this.xExtent = [this.xExtent[0] - xPadding, this.xExtent[1] + xPadding];
            this.yExtent = [this.yExtent[0] - yPadding, this.yExtent[1] + yPadding];

        } catch (error) {
            console.error('Error processing data:', error);
            this.formattedPCAData = {};
        }
    }

    performPCA(data, numComponents = 2) {
        try {
            // 1. Data should already be standardized from your previous step

            // 2. Compute the covariance matrix
            const n = data.length;
            const d = data[0].length;
            const cov = Array(d).fill().map(() => Array(d).fill(0));

            for (let i = 0; i < d; i++) {
                for (let j = 0; j < d; j++) {
                    let sum = 0;
                    for (let k = 0; k < n; k++) {
                        sum += data[k][i] * data[k][j];
                    }
                    cov[i][j] = sum / (n - 1);
                }
            }

            // 3. Calculate eigenvalues - jStat 1.9.6 doesn't have this built-in functionality
            // We'll use power iteration to find the principal components directly

            // First component
            const pc1 = this.powerIteration(cov);

            // Second component - orthogonal to first (using deflation)
            const deflatedCov = this.deflateMatrix(cov, pc1);
            const pc2 = this.powerIteration(deflatedCov);

            // 4. Project data onto principal components
            const projections = data.map(row => [
                row.reduce((sum, val, i) => sum + val * pc1[i], 0),
                row.reduce((sum, val, i) => sum + val * pc2[i], 0)
            ]);

            // 5. Calculate approximate explained variance
            // This is a rough approximation since we haven't directly computed eigenvalues
            const totalVar = this.calculateTotalVariance(cov);
            const var1 = this.calculateComponentVariance(data, pc1);
            const var2 = this.calculateComponentVariance(data, pc2);

            const explainedVarianceRatio = [
                var1 / totalVar,
                var2 / totalVar
            ];

            return {
                components: [pc1, pc2],
                projections,
                explainedVarianceRatio
            };
        } catch (error) {
            console.error("Error in PCA computation:", error);
            // Return empty projections as fallback
            return {
                components: [],
                projections: data.map(() => [0, 0]),
                explainedVarianceRatio: [0, 0]
            };
        }
    }

// Power iteration method to find the principal eigenvector
    powerIteration(matrix, iterations = 200, tolerance = 1e-10) {
        const n = matrix.length;
        // Start with a random vector
        let vector = Array(n).fill().map(() => Math.random() - 0.5);

        // Normalize
        const normalize = v => {
            const magnitude = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
            return magnitude === 0 ? v : v.map(val => val / magnitude);
        };

        vector = normalize(vector);

        for (let iter = 0; iter < iterations; iter++) {
            // Matrix-vector multiplication
            const newVector = Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    newVector[i] += matrix[i][j] * vector[j];
                }
            }

            // Normalize the result
            const normalizedNew = normalize(newVector);

            // Check for convergence
            const diff = normalizedNew.reduce((sum, val, i) => sum + Math.abs(val - vector[i]), 0);
            if (diff < tolerance) {
                return normalizedNew;
            }

            vector = normalizedNew;
        }

        return vector;
    }

// Deflate the matrix to find orthogonal components
    deflateMatrix(matrix, eigenvector) {
        const n = matrix.length;
        const result = Array(n).fill().map(() => Array(n).fill(0));

        // Calculate outer product of eigenvector
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                // Calculate the outer product term
                const outerProduct = eigenvector[i] * eigenvector[j];

                // Calculate eigenvalue using Rayleigh quotient
                let rayleigh = 0;
                for (let p = 0; p < n; p++) {
                    for (let q = 0; q < n; q++) {
                        rayleigh += eigenvector[p] * matrix[p][q] * eigenvector[q];
                    }
                }

                // Deflate the matrix
                result[i][j] = matrix[i][j] - rayleigh * outerProduct;
            }
        }

        return result;
    }

// Calculate total variance (sum of diagonal elements of covariance matrix)
    calculateTotalVariance(covMatrix) {
        let sum = 0;
        for (let i = 0; i < covMatrix.length; i++) {
            sum += covMatrix[i][i];
        }
        return sum;
    }

// Calculate variance explained by a component
    calculateComponentVariance(data, component) {
        // Project data onto component
        const projection = data.map(row =>
            row.reduce((sum, val, i) => sum + val * component[i], 0)
        );

        // Calculate variance of projection
        const mean = jStat.mean(projection);
        const variance = jStat.variance(projection, true);

        return variance;
    }

    createYearColorLegend() {
        const legend = this.svg.select(".year-legend");
        if (!legend.empty()) {
            legend.remove();
        }

        // Create Year color legend
        const year_legend = this.mainGroup.append("g")
            .attr("class", "year-legend")
            .attr("transform", `translate(-20, ${this.innerHeight + 30})`);

        const legendWidth = 200;
        const legendHeight = 20;

        // Create gradient
        const gradient = year_legend.append("defs")
            .append("linearGradient")
            .attr("id", "year-gradient")
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "100%")
            .attr("y2", "0%");

        const domain = this.yearColorScale.domain();
        const minYear = domain[0];
        const maxYear = domain[1];
        const yearRange = maxYear - minYear;

        // Create color stops
        const stops = 10;
        for (let i = 0; i <= stops; i++) {
            const year = minYear + (yearRange * (i / stops));
            gradient.append("stop")
                .attr("offset", `${(i / stops) * 100}%`)
                .attr("stop-color", this.yearColorScale(year));
        }

        // Add rectangle with gradient
        year_legend.append("rect")
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .style("fill", "url(#year-gradient)")
            .style("stroke", "black")
            .style("stroke-width", "1px");

        // Get array of all years
        const years = Array.from(
            { length: maxYear - minYear + 1 },
            (_, i) => minYear + i
        );

        // Add divider lines for each year
        years.forEach(year => {
            const lineX = ((year - minYear) / yearRange) * legendWidth;

            // Add divider line
            year_legend.append("line")
                .attr("x1", lineX)
                .attr("x2", lineX)
                .attr("y1", -7)
                .attr("y2", legendHeight + 7)
                .attr("stroke", "white")
                .attr("stroke-width", 1)
                .style("opacity", 0.5);
        });

        // Add start and end year labels
        year_legend.append("text")
            .attr("x", -30)
            .attr("y", legendHeight - 5)
            .attr("text-anchor", "start")
            .attr("font-size", "10px")
            .text(minYear);

        year_legend.append("text")
            .attr("x", legendWidth + 30)
            .attr("y", legendHeight - 5)
            .attr("text-anchor", "end")
            .attr("font-size", "10px")
            .text(maxYear);

        // Add a single interactive overlay for the entire legend
        const interactiveArea = year_legend.append("rect")
            .attr("x", 0)
            .attr("y", -7)
            .attr("width", legendWidth)
            .attr("height", legendHeight + 14)
            .attr("fill", "transparent")
            .style("cursor", "pointer")
            .on("mousemove", (event) => {
                // Calculate which year based on mouse position
                const mouseX = d3.pointer(event)[0];
                const yearFloat = (mouseX / legendWidth) * yearRange + minYear;
                const year = Math.round(yearFloat);

                if (year >= minYear && year <= maxYear) {
                    const lineX = ((year - minYear) / yearRange) * legendWidth;

                    // Remove any existing temporary labels
                    year_legend.selectAll(".temp-year-label").remove();

                    // First, hide all point labels
                    this.mainGroup.selectAll(".point-label")
                        .style("display", "none");

                    // Dim all points
                    this.mainGroup.selectAll(".pca_point")
                        .style("opacity", 0.1)
                        .style("stroke", d => this.stationColorScale(d.station_id))
                        .style("stroke-width", "1.5px");

                    // Then show and highlight only the current year's points and labels
                    this.mainGroup.selectAll(`.point-label.year-${year}`)
                        .style("display", "block")
                        .style("opacity", 1)
                        .raise();

                    this.mainGroup.selectAll(`.pca_point.year-${year}`)
                        .style("opacity", 1)
                        .style("stroke", "black")
                        .style("stroke-width", "2px");

                    // Add temporary year label
                    year_legend.append("text")
                        .attr("class", "temp-year-label")
                        .attr("x", lineX)
                        .attr("y", -5)
                        .attr("text-anchor", "middle")
                        .attr("font-size", "10px")
                        .text(year);

                    this.dedupeLabels('point-label');
                }
            })
            .on("mouseout", () => {
                // Reset all points
                this.mainGroup.selectAll(".pca_point")
                    .style("opacity", 1)
                    .style("stroke", d => this.stationColorScale(d.station_id))
                    .style("stroke-width", "1.5px");

                // Reset labels to their original visibility state
                this.mainGroup.selectAll(`.point-label`)
                    .style("display", "block")
                    .style("opacity", 1)
                    .raise();

                // Handle label overlapping
                this.dedupeLabels('point-label');

                // Remove temporary year label
                year_legend.selectAll(".temp-year-label").remove();
            });
    }


    mouseoverStationLegend(event, stationObj)
    {
        const tooltip = document.getElementById('d3-style-tooltip');

        const station_title = `[${stationObj.id}] ${stationObj.name}`;
        const tooltiptext = this.formatStationInfoTooltip(stationObj);

        tooltip.innerHTML = `
                        <div style="border-bottom: 1px solid rgba(255,255,255,0.3); margin-bottom: 5px; padding-bottom: 5px">
                            <strong>${station_title}</strong>
                        </div>
                        ${tooltiptext}
                    `;

        // Ensure the tooltip has the proper styling to appear on top
        // tooltip.style.position = 'fixed'; // Use fixed instead of absolute for better positioning
        tooltip.style.zIndex = '9999';    // High z-index ensures it's on top
        tooltip.style.pointerEvents = 'none'; // Prevents the tooltip from interfering with mouse events

        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        let left = event.pageX + 10;
        let top = event.pageY - .3 * tooltipHeight;

        if (left + tooltipWidth > window.innerWidth) {
            left = event.pageX - tooltipWidth - 10;
        }
        // if (top < 0) {
        //     top = event.pageY + 10;
        // }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.opacity = '1';
    }

    mouseoutStationLegend() {
        const tooltip = document.getElementById('d3-style-tooltip');
        tooltip.style.opacity = '0';
    }

    mousemoveStationLegend(event) {
        const tooltip = document.getElementById('d3-style-tooltip');

        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        let left = event.pageX + 10;
        let top = event.pageY - .3 * tooltipHeight;

        if (left + tooltipWidth > window.innerWidth) {
            left = event.pageX - tooltipWidth - 10;
        }
        // if (top < 0) {
        //     top = event.pageY + 10;
        // }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    createStationLegend() {
        const legend = this.svg.select(".station-legend");
        if (!legend.empty()) {
            legend.remove();
        }

        // Get the year legend's position and dimensions
        const yearLegend = this.mainGroup.select(".year-legend");
        const yearLegendBBox = yearLegend.node().getBBox();
        const yearLegendEndX = yearLegendBBox.x + yearLegendBBox.width;

        const station_ids = this.stationColorScale.domain();
        const padding = 15;
        const circleRadius = 5;
        const circleTextPadding = 10;
        const rowHeight = 20;
        const startX = yearLegendEndX + 40; // Add some spacing after year legend

        // Create the container and position it relative to the year legend
        const container = this.mainGroup.append("g")
            .attr("class", "station-legend")
            .attr("transform", `translate(${startX}, ${this.innerHeight + 30})`); // Match year legend's Y position

        // First create temporary text elements to measure their widths
        const tempGroup = container.append("g");
        const textWidths = new Map();

        station_ids.forEach(station_id => {
            const station_sname = this.IETDHPCPStations[station_id].sname;

            const tempText = tempGroup.append("text")
                .attr("font-family", "Arial")
                .attr("font-size", "10px")
                .text(station_sname);

            textWidths.set(station_id, tempText.node().getBBox().width);
        });
        tempGroup.remove();

        // Calculate positions
        let currentX = 0;
        let currentY = 0;
        const rows = [];
        let currentRow = [];
        const availableWidth = this.innerWidth - startX - 20; // Available width after year legend

        station_ids.forEach(station_id => {
            const itemWidth = textWidths.get(station_id) + circleRadius * 2 + circleTextPadding + padding;

            if (currentX + itemWidth > availableWidth && currentRow.length > 0) {
                rows.push(currentRow);
                currentRow = [];
                currentX = 0;
                currentY += rowHeight;
            }

            currentRow.push({
                station_id,
                width: itemWidth
            });

            currentX += itemWidth;
        });

        if (currentRow.length > 0) {
            rows.push(currentRow);
        }

        // Position items in each row
        rows.forEach((row, rowIndex) => {
            let currentX = 0;
            row.forEach(station => {
                station.x = currentX;
                station.y = rowIndex * rowHeight;
                currentX += station.width;
            });
        });

        // Create legend items
        rows.forEach(row => {
            row.forEach(station => {
                const station_sname = this.IETDHPCPStations[station.station_id].sname;

                const legendItem = container.append("g")
                    .attr("class", "legend-station")
                    .attr("transform", `translate(${station.x}, ${station.y})`);

                // First add an invisible hit area that covers both circle and text
                const textWidth = textWidths.get(station.station_id);
                const hitArea = legendItem.append("rect")
                    .attr("x", 0)
                    .attr("y", 0)
                    .attr("width", circleRadius * 2 + circleTextPadding + textWidth)
                    .attr("height", rowHeight)
                    .attr("fill", "transparent") // Make it invisible
                    .style("cursor", "pointer");

                // Add circle
                legendItem.append("circle")
                    .attr("r", circleRadius)
                    .attr("cx", circleRadius)
                    .attr("cy", rowHeight / 2)
                    .attr("stroke", this.stationColorScale(station.station_id))
                    .attr("fill", "none")
                    .style("pointer-events", "none"); // Disable mouse events on circle

                // Add text
                legendItem.append("text")
                    .attr("x", circleRadius * 2 + circleTextPadding)
                    .attr("y", rowHeight/2 + 4)
                    .attr("font-family", "Arial")
                    .attr("font-size", "10px")
                    .text(station_sname)
                    .style("pointer-events", "none"); // Disable mouse events on text

                // Add hover interaction to the hit area
                hitArea
                    .on("mouseover", (event) => {
                        // Dim all points
                        this.mainGroup.selectAll(".pca_point")
                            .style("opacity", 0.1);

                        // Hide all existing labels
                        this.mainGroup.selectAll(".point-label")
                            .style("display", "none");

                        // Highlight points from this station and add year labels
                        this.mainGroup.selectAll(".pca_point")
                            .filter(d => d.station_id === station.station_id)
                            .each((d, i, nodes) => {
                                // Highlight the point
                                const point = d3.select(nodes[i]);
                                point.style("opacity", 1)
                                    .style("stroke-width", "2px");

                                // Add temporary year label
                                const x = parseFloat(point.attr("cx"));
                                const y = parseFloat(point.attr("cy"));

                                this.mainGroup.append("text")
                                    .attr("class", "temp-year-label")
                                    .attr("x", x)
                                    .attr("y", y - 10)
                                    .attr("year", d.year)
                                    .attr("station_id", d.station_id)
                                    .attr("text-anchor", "middle")
                                    .attr("font-family", "Arial")
                                    .attr("font-size", "10px")
                                    .text(d.year);
                            });

                        const stationObj = this.IETDHPCPStations[station.station_id];
                        this.mouseoverStationLegend(event, stationObj);

                        // Handle label overlapping
                        this.dedupeLabels('temp-year-label');
                    })
                    .on("mouseout", () => {
                        // Reset all points
                        this.mainGroup.selectAll(".pca_point")
                            .style("opacity", 1)
                            .style("stroke-width", "1.5px");

                        // Remove temporary year labels
                        this.mainGroup.selectAll(".temp-year-label").remove();

                        // Restore original labels
                        this.mainGroup.selectAll(".point-label")
                            .style("display", function() {
                                return d3.select(this).classed("visible-label") ? "block" : "none";
                            });

                        this.mouseoutStationLegend();

                        // reset all point labels
                        this.mainGroup.selectAll(`.point-label`)
                            .style("display", "block")
                            .style("opacity", 1)
                            .raise();

                        // Handle label overlapping
                        this.dedupeLabels('point-label');
                    })
                    .on("mousemove", (event) => {
                        this.mousemoveStationLegend(event);
                    });
            });
        });
    }

    createScales() {
        this.xScale = d3.scaleLinear()
            .domain(this.xExtent)
            .range([0, this.innerWidth]);

        this.yScale = d3.scaleLinear()
            .domain(this.yExtent)
            .range([this.innerHeight, 0]);
    }
    createAxes() {
        // Remove any existing main group
        this.svg.selectAll("g.main-group").remove();

        // Create new main group with a class for easier selection later
        this.mainGroup = this.svg.append("g")
            .attr("class", "main-group")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

        // Remove any existing axes
        this.svg.selectAll(".x.axis, .y.axis").remove();

        // X-axis
        this.xAxis = this.mainGroup.append("g")
            .attr("class", "x axis")
            .attr("color", "black")
            .attr("transform", `translate(0, ${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale));

        // Y-axis
        this.yAxis = this.mainGroup.append("g")
            .attr("class", "y axis")
            .attr("color", "black")
            .call(d3.axisLeft(this.yScale));

        // Remove any existing labels
        this.svg.selectAll(".x-label, .y-label, .title").remove();

        // Axis labels
        // X-axis label (positioned to the right)
        this.mainGroup.append("text")
            .attr("class", "x-label")
            .attr("text-anchor", "start")
            .attr("font-size", "12px")
            .attr("x", this.innerWidth - 20)  // Position it right of the chart
            .attr("y", this.innerHeight + 40)  // Align with the x-axis
            .text("PC1");

        // Y-axis label (positioned at the top)
        this.mainGroup.append("text")
            .attr("class", "y-label")
            .attr("text-anchor", "start")
            .attr("font-size", "12px")
            .attr("transform", "rotate(-90)")
            .attr("x", -20)  // Start from the left edge
            .attr("y", -45)  // Position above the chart
            .text("PC2");  // Shortened text

        // Title with IETD hour
        const titleText = `${this.title}`;
        this.mainGroup.append("text")
            .attr("class", "title")
            .attr("text-anchor", "middle")
            .attr("x", this.innerWidth / 2)
            .attr("y", -5)
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text(titleText);
    }

    dedupeLabels(labelType = 'point-label') {
        // Remove existing connector lines
        this.mainGroup.selectAll(".label-connector").remove();

        const points = this.mainGroup.selectAll(".pca_point");
        // Select only visible labels
        const labels = this.mainGroup.selectAll(`.${labelType}`)
            .filter(function() {
                return this.style.display !== 'none';
            });

        if (labels.empty()) return;

        // Helper function to check overlap between two labels
        const checkOverlap = (rect1, rect2) => {
            const padding = 2;
            return !(
                rect1.right + padding < rect2.left - padding ||
                rect1.left - padding > rect2.right + padding ||
                rect1.bottom + padding < rect2.top - padding ||
                rect1.top - padding > rect2.bottom + padding
            );
        };

        // Add line intersection check function
        const doLinesIntersect = (line1, line2) => {
            // Line 1 points
            const x1 = line1.x1, y1 = line1.y1;
            const x2 = line1.x2, y2 = line1.y2;
            // Line 2 points
            const x3 = line2.x1, y3 = line2.y1;
            const x4 = line2.x2, y4 = line2.y2;

            // Calculate denominator
            const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (den === 0) return false; // Lines are parallel

            // Calculate intersection point
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
            const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

            // Check if intersection point lies on both line segments
            return t >= 0 && t <= 1 && u >= 0 && u <= 1;
        };

        // Keep track of connector lines
        const connectorLines = [];

        // Modify createConnectorLine function
        const createConnectorLine = (pointX, pointY, labelX, labelY) => {
            // Create line data
            const newLine = {
                x1: pointX,
                y1: pointY,
                x2: labelX,
                y2: labelY
            };

            // Check if this line intersects with any existing lines
            const hasIntersection = connectorLines.some(line => doLinesIntersect(newLine, line));
            if (hasIntersection) return false;

            // If no intersection, create the line and add to tracking array
            this.mainGroup.append("line")
                .attr("class", "label-connector")
                .attr("x1", pointX)
                .attr("y1", pointY)
                .attr("x2", labelX)
                .attr("y2", labelY)
                .style("stroke", "#666")
                .style("stroke-width", "0.5")
                .style("stroke-dasharray", "2,2")
                .style("opacity", 0.7);

            connectorLines.push(newLine);
            return true;
        };

        // Helper function to calculate minimum distance between point and label rectangle
        const getMinDistance = (point, label) => {
            // Find nearest x coordinate
            const nearestX = Math.max(label.left, Math.min(point.x, label.right));
            // Find nearest y coordinate
            const nearestY = Math.max(label.top, Math.min(point.y, label.bottom));

            // Calculate distance to nearest point on rectangle
            return Math.hypot(point.x - nearestX, point.y - nearestY);
        };

        // Add this function near the start of dedupeLabels
        const getPointDensity = (point, points, radius = 50) => {
            let count = 0;
            points.each(function() {
                const px = parseFloat(d3.select(this).attr("cx"));
                const py = parseFloat(d3.select(this).attr("cy"));
                const dist = Math.hypot(px - point.pointX, py - point.pointY);
                if (dist <= radius) count++;
            });
            return count;
        };


        // Collect label information
        const labelInfo = [];
        labels.each(function(d) {
            const label = d3.select(this);
            const bbox = this.getBBox();
            let pointX, pointY, labelX;

            if (labelType === 'temp-year-label') {
                const year = parseInt(label.attr("year"));
                const station_id = label.attr("station_id");
                const point = points.filter(d => d.year === year && d.station_id === station_id).nodes()[0];
                if (!point) return;

                pointX = parseFloat(d3.select(point).attr("cx"));
                pointY = parseFloat(d3.select(point).attr("cy"));
                labelX = parseFloat(label.attr("x"));

                labelInfo.push({
                    element: this,
                    pointX: pointX,
                    pointY: pointY,
                    originalX: labelX,
                    originalY: parseFloat(label.attr("y")),
                    width: bbox.width,
                    height: bbox.height,
                    left: labelX - (bbox.width / 2), // Adjust for text-anchor: middle
                    right: labelX + (bbox.width / 2), // Adjust for text-anchor: middle
                    top: parseFloat(label.attr("y")) - bbox.height,
                    bottom: parseFloat(label.attr("y")),
                    visible: true
                });
            } else {
                const point = points.filter(p => p.year === d.year && p.station_id === d.station_id);

                labelInfo.push({
                    element: this,
                    pointX: parseFloat(point.attr("cx")),
                    pointY: parseFloat(point.attr("cy")),
                    originalX: parseFloat(label.attr("x")),
                    originalY: parseFloat(label.attr("y")),
                    width: bbox.width,
                    height: bbox.height,
                    left: parseFloat(label.attr("x")),
                    right: parseFloat(label.attr("x")) + bbox.width,
                    top: parseFloat(label.attr("y")) - bbox.height,
                    bottom: parseFloat(label.attr("y")),
                    visible: true
                });
            }
        });

        // Sort labels based on type
        if (labelType === 'temp-year-label') {
            labelInfo.sort((a, b) => a.originalX - b.originalX);
        } else {
            labelInfo.sort((a, b) => {
                const pointA = { x: a.pointX, y: a.pointY };
                const pointB = { x: b.pointX, y: b.pointY };
                const labelRectA = {
                    left: a.left,
                    right: a.right,
                    top: a.top,
                    bottom: a.bottom
                };
                const labelRectB = {
                    left: b.left,
                    right: b.right,
                    top: b.top,
                    bottom: b.bottom
                };

                const distA = getMinDistance(pointA, labelRectA);
                const distB = getMinDistance(pointB, labelRectB);
                return distA - distB;
            });
        }

        // Keep track of successfully positioned labels
        const positionedLabels = [];

        // Add boundary check function
        const checkBoundary = (pos) => {
            const newLeft = Math.max(0, Math.min(this.innerWidth - pos.width, pos.left));
            const newRight = newLeft + pos.width;
            const newTop = Math.max(0, Math.min(this.innerHeight - pos.height, pos.top));
            const newBottom = newTop + pos.height;

            return {
                left: newLeft,
                right: newRight,
                top: newTop,
                bottom: newBottom,
                width: pos.width,
                height: pos.height
            };
        };

        // Add a function to check overlap with point
        const checkPointOverlap = (labelRect, pointX, pointY, radius = 3) => {
            // Check if the label rectangle overlaps with the point (including some padding)
            const padding = 5; // Extra padding around point
            const pointRect = {
                left: pointX - radius - padding,
                right: pointX + radius + padding,
                top: pointY - radius - padding,
                bottom: pointY + radius + padding
            };

            return checkOverlap(labelRect, pointRect);
        };

        // Try to position each label
        labelInfo.forEach((curr) => {
            // First check if current position is within boundaries
            let currPos = checkBoundary(curr);

            // Check if current position has any overlaps with positioned labels
            let hasOverlap = positionedLabels.some(label => checkOverlap(currPos, label));

            if (!hasOverlap) {
                // Current position is fine, just ensure it's within boundaries
                const label = d3.select(curr.element);
                if (labelType === 'temp-year-label') {
                    label
                        .attr("x", currPos.left + (currPos.width / 2))
                        .attr("y", currPos.bottom)
                        .style("display", "block");

                    createConnectorLine(curr.pointX, curr.pointY,
                        currPos.left + (currPos.width / 2),
                        currPos.bottom);
                } else {
                    // For point labels, maintain original position relative to point
                    const dx = curr.originalX - curr.pointX;  // Get original offset
                    const connectorEndX = curr.pointX + dx;   // Use original offset for connector

                    label
                        .attr("x", connectorEndX)
                        .attr("y", currPos.bottom)
                        .style("display", "block");

                    createConnectorLine(curr.pointX, curr.pointY,
                        connectorEndX,
                        currPos.bottom);
                }

                // Update tracking positions
                const updatedPos = {
                    left: labelType === 'temp-year-label' ? currPos.left : curr.originalX,
                    right: labelType === 'temp-year-label' ? currPos.right : curr.originalX + curr.width,
                    top: currPos.top,
                    bottom: currPos.bottom,
                    width: curr.width,
                    height: curr.height
                };

                positionedLabels.push(updatedPos);
                return;
            }

            // Try alternative positions...
            const distance = 20;
            const positions = labelType === 'temp-year-label'
                ? [
                    { dy: -distance }, // Up
                    { dy: -distance * 1.5 }, // Further up
                    { dy: -distance * 2 }, // Even further up
                    { dy: distance }, // Down
                    { dy: distance * 1.5 }, // Further down
                    { dy: distance * 2 }, // Even further down
                ]
                : [
                    { dx: 0, dy: -distance }, // North
                    { dx: distance, dy: -distance }, // Northeast
                    { dx: distance, dy: 0 }, // East
                    { dx: distance, dy: distance }, // Southeast
                    { dx: 0, dy: distance }, // South
                    { dx: -distance, dy: distance }, // Southwest
                    { dx: -distance, dy: 0 }, // West
                    { dx: -distance, dy: -distance } // Northwest
                ];

            let foundPosition = false;
            for (const pos of positions) {
                let testPos = labelType === 'temp-year-label'
                    ? {
                        left: curr.originalX - (curr.width / 2),
                        right: curr.originalX + (curr.width / 2),
                        top: curr.originalY + pos.dy - curr.height,
                        bottom: curr.originalY + pos.dy,
                        width: curr.width,
                        height: curr.height
                    }
                    : {
                        left: curr.pointX + pos.dx + (pos.dx >= 0 ? 10 : -(curr.width + 10)), // Add offset based on direction
                        right: curr.pointX + pos.dx + (pos.dx >= 0 ? (10 + curr.width) : -10),
                        top: curr.pointY + pos.dy - curr.height,
                        bottom: curr.pointY + pos.dy,
                        width: curr.width,
                        height: curr.height
                    };

                testPos = checkBoundary(testPos);

                // Check all types of overlaps
                let overlapWithPoint = checkPointOverlap(testPos, curr.pointX, curr.pointY);
                let overlapWithLabels = positionedLabels.some(label => checkOverlap(testPos, label));

                if (!overlapWithPoint && !overlapWithLabels) {
                    const label = d3.select(curr.element);
                    if (labelType === 'temp-year-label') {
                        const connectorEndX = testPos.left + (testPos.width / 2);

                        // Check if connector line can be created without intersections
                        if (createConnectorLine(curr.pointX, curr.pointY, connectorEndX, testPos.bottom)) {
                            label
                                .attr("x", connectorEndX)
                                .attr("y", testPos.bottom)
                                .style("display", "block");

                            positionedLabels.push(testPos);
                            foundPosition = true;
                            break;
                        }
                    } else {
                        const connectorEndX = testPos.left;

                        // Check if connector line can be created without intersections
                        if (createConnectorLine(curr.pointX, curr.pointY, connectorEndX, testPos.bottom)) {
                            label
                                .attr("x", connectorEndX)
                                .attr("y", testPos.bottom)
                                .style("display", "block");

                            positionedLabels.push(testPos);
                            foundPosition = true;
                            break;
                        }
                    }
                }
            }

            if (!foundPosition) {
                d3.select(curr.element).style("display", "none");
                curr.visible = false;
            }
        });
    }

    createVisualization() {
        // Create tooltip if it doesn't exist
        this.createTooltip();

        // Flatten data for visualization while preserving station information
        const flattenedData = Object.values(this.formattedPCAData).flat();

        // Add new points
        const points = this.mainGroup.selectAll(".point")
            .data(flattenedData);

        // Enter points
        points.enter()
            .append("circle")
            .attr("class", d => `pca_point station-${d.station_id} year-${d.year}`)
            .merge(points)
            .attr("r", 3)
            .attr("fill", d => this.yearColorScale(d.year))
            .attr("stroke", d => this.stationColorScale(d.station_id))
            .attr("stroke-width", 1.5)
            .attr("cx", d => this.xScale(d.x))
            .attr("cy", d => this.yScale(d.y))
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));

        // Exit points
        points.exit().remove();

        // Add a click handler to the main SVG to deselect all when clicking outside points
        // this.svg.on("click", (event) => {
        //     // Only handle if it's not a point click and Ctrl is not pressed
        //     if (!event.ctrlKey && !event.metaKey && !event.target.classList.contains('pca_point')) {
        //         this.clearAllSelections();
        //     }
        // });

        // Add labels
        const labels = this.mainGroup.selectAll(".point-label")
            .data(flattenedData);

        // Enter labels
        labels.enter()
            .append("text")
            .attr("class", d => `point-label station-${d.station_id} year-${d.year}`)
            .merge(labels)
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", d => this.stationColorScale(d.station_id))
            .attr("x", d => this.xScale(d.x))
            .attr("y", d => this.yScale(d.y) - 30)
            .style("pointer-events", "none")  // ignore mouse events on text
            .text(d => `${this.IETDHPCPStations[d.station_id].sname} (${d.year})`);

        // Exit labels
        labels.exit().remove();

        // Handle label overlapping
        this.dedupeLabels('point-label');

        // Year color legend
        this.createYearColorLegend();

        // Station legend
        this.createStationLegend();
    }

    // Handle point selection with Ctrl+Click
    handlePointSelection(event, d) {
        // Create a unique identifier for this point
        const pointId = `${d.station_id}-${d.year}`;

        // Check if point is already selected
        if (this.selectedPoints.has(pointId)) {
            // Deselect the point
            this.selectedPoints.delete(pointId);

            // Reset point style
            d3.select(event.target)
                .attr("stroke-width", 1.5)
                .attr("stroke", d => this.stationColorScale(d.station_id))
                .attr("r", 3);

            // Remove persistent tooltip if it exists
            if (this.persistentTooltips.has(pointId)) {
                this.persistentTooltips.get(pointId).remove();
                this.persistentTooltips.delete(pointId);
            }
        } else {
            // Select the point
            this.selectedPoints.add(pointId);

            // Highlight the point
            d3.select(event.target)
                .attr("stroke-width", 3)
                .attr("stroke", "#FF0000") // Red outline for selected points
                .attr("r", 5); // Slightly larger

            // Create a persistent tooltip
            this.createPersistentTooltip(d, event);
        }
    }

    // Create a persistent tooltip for selected points
    // Modify the createPersistentTooltip method to position tooltips near the circles
    createPersistentTooltip(d, event) {
        const pointId = `${d.station_id}-${d.year}`;

        // Get the features for this station and year
        const features = this.computedFeatures[d.station_id][d.year];

        // Format precipitation values
        const formatPrecip = (val) => val.toFixed(1);
        const formatPercent = (val) => (val * 100).toFixed(1) + '%';

        // Calculate seasonal percentages
        const winterPct = formatPercent(features.seasonalProportions.winter);
        const springPct = formatPercent(features.seasonalProportions.spring);
        const summerPct = formatPercent(features.seasonalProportions.summer);
        const fallPct = formatPercent(features.seasonalProportions.fall);

        // Create persistent tooltip content
        let tooltipContent = `
    <div class="persistent-tooltip-content" style="color:black; padding: 8px; border-radius: 8px; max-width: 400px; font-family: Arial, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h7 style="margin: 0 0 8px 0; color:blue">${this.IETDHPCPStations[d.station_id].name} [${d.station_id}] (${d.year})</h7>
            <button class="close-tooltip-btn" style="background: none; border: none; cursor: pointer; font-size: 16px; font-weight: bold; color: #555;" data-point-id="${pointId}">×</button>
        </div>
        <p style="margin: 0 0 8px 0;"><b>PCA Position:</b> PC1=${d.x.toFixed(3)}, PC2=${d.y.toFixed(3)}</p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
                <h7 style="margin: 0 0 4px 0;"><b>Annual Summary</b></h7>
                <p style="margin: 0;">Total Precipitation: ${formatPrecip(features.totalPrecipitation)}</p>
                <p style="margin: 0;">Event Count: ${features.eventCount}</p>
                <p style="margin: 0;">Max Event: ${formatPrecip(features.maxVolume)}</p>
                <p style="margin: 0;">Mean Intensity: ${features.meanIntensity.toFixed(2)}</p>
            </div>
            
            <div>
                <h7 style="margin: 0 0 4px 0;"><b>Seasonal Distribution</b></h7>
                <p style="margin: 0;">Winter: ${winterPct} (${features.winter.eventCount} events)</p>
                <p style="margin: 0;">Spring: ${springPct} (${features.spring.eventCount} events)</p>
                <p style="margin: 0;">Summer: ${summerPct} (${features.summer.eventCount} events)</p>
                <p style="margin: 0;">Fall: ${fallPct} (${features.fall.eventCount} events)</p>
            </div>
        </div>
    </div>`;

        // Calculate point position
        const pointX = this.xScale(d.x);
        const pointY = this.yScale(d.y);

        // Position for tooltip (to the right of the point)
        const tooltipX = pointX + 15;
        const tooltipY = pointY - 80;

        // Create a group for the tooltip and connector line
        const tooltipGroup = this.mainGroup.append("g")
            .attr("class", "tooltip-group")
            .attr("id", `tooltip-group-${pointId}`);

        // Add connector line first (so it's behind the tooltip)
        const connectorLine = tooltipGroup.append("line")
            .attr("class", "tooltip-connector")
            .attr("x1", pointX)
            .attr("y1", pointY)
            .attr("x2", tooltipX)
            .attr("y2", tooltipY + 80) // Connect to middle of tooltip
            .style("stroke", "#FF0000")
            .style("stroke-width", "1.5")
            .style("stroke-dasharray", "4,4")
            .style("pointer-events", "none"); // Don't interfere with mouse events

        // Create the tooltip foreignObject
        const persistentTooltip = tooltipGroup.append("foreignObject")
            .attr("class", "persistent-annualpca-tooltip")
            .attr("id", `persistent-tooltip-${pointId}`)
            .style("pointer-events", "auto") // Allow interaction
            .style("cursor", "move") // Show move cursor
            .attr("width", 320) // Set width for the tooltip
            .attr("height", 180) // Initial height, will adjust based on content
            .attr("x", tooltipX)
            .attr("y", tooltipY);

        // Add HTML content
        persistentTooltip.append("xhtml:div")
            .style("background", "#fff")
            .style("padding", "5px")
            .style("border", "2px solid red")
            .style("border-radius", "5px")
            .style("box-shadow", "2px 2px 5px rgba(0,0,0,0.3)")
            .style("font-family", "Arial")
            .style("font-size", "11px")
            .style("width", "100%")
            .style("height", "100%")
            .style("overflow", "auto")
            .html(tooltipContent);

        // Improved drag behavior that maintains relative cursor position
        const drag = d3.drag()
            .subject(function() {
                const tooltipEl = d3.select(this);
                return {
                    x: parseFloat(tooltipEl.attr("x")),
                    y: parseFloat(tooltipEl.attr("y"))
                };
            })
            .on("start", function() {
                d3.select(this).raise(); // Bring to front when dragging
                d3.select(this).style("opacity", 0.8); // Visual feedback
            })
            .on("drag", function(event) {
                // Update tooltip position
                d3.select(this)
                    .attr("x", event.x)
                    .attr("y", event.y);

                // Update connector line
                connectorLine
                    .attr("x2", event.x + 10) // Connect to left side of tooltip
                    .attr("y2", event.y + 80); // Connect to middle of tooltip
            })
            .on("end", function() {
                d3.select(this).style("opacity", 1); // Reset opacity
            });

        persistentTooltip.call(drag);

        // Store the tooltip group reference (not just the tooltip)
        this.persistentTooltips.set(pointId, tooltipGroup);

        // Add event handler for the close button
        persistentTooltip.select(".close-tooltip-btn").on("click", (event) => {
            const clickedPointId = event.target.getAttribute("data-point-id");
            this.removeSelection(clickedPointId);
            event.stopPropagation(); // Prevent bubbling
        });
    }

    // Update removeSelection to handle the new tooltip implementation
    removeSelection(pointId) {
        if (this.selectedPoints.has(pointId)) {
            this.selectedPoints.delete(pointId);

            // Reset the point style
            const [stationId, year] = pointId.split('-');
            this.mainGroup.selectAll(`.pca_point.station-${stationId}.year-${year}`)
                .attr("stroke-width", 1.5)
                .attr("stroke", this.stationColorScale(stationId))
                .attr("r", 3);

            // Remove the tooltip group (contains both the tooltip and connector line)
            if (this.persistentTooltips.has(pointId)) {
                this.persistentTooltips.get(pointId).remove();
                this.persistentTooltips.delete(pointId);
            }
        }
    }

    // Clear all selections
    clearAllSelections() {
        // Convert Set to Array to avoid issues with modifying during iteration
        const selectedPointIds = Array.from(this.selectedPoints);

        selectedPointIds.forEach(pointId => {
            this.removeSelection(pointId);
        });

        // Reset all points
        this.mainGroup.selectAll(".pca_point")
            .attr("stroke-width", 1.5)
            .attr("stroke", d => this.stationColorScale(d.station_id))
            .attr("r", 3);
    }


    handleMouseOver(event, d) {
        // Highlight point
        d3.select(event.target)
            .raise() // Brings element to front
            .attr("stroke-width", 2)
            .attr("stroke", "#333")
            .attr("fill", "brown");

        // Get the features for this station and year
        const features = this.computedFeatures[d.station_id][d.year];

        // Get mouse coordinates relative to the viewport
        const mouseX = event.clientX;
        const mouseY = event.clientY;

        // Format precipitation values
        const formatPrecip = (val) => val.toFixed(1);
        const formatPercent = (val) => (val * 100).toFixed(1) + '%';

        // Calculate seasonal percentages
        const winterPct = formatPercent(features.seasonalProportions.winter);
        const springPct = formatPercent(features.seasonalProportions.spring);
        const summerPct = formatPercent(features.seasonalProportions.summer);
        const fallPct = formatPercent(features.seasonalProportions.fall);

        // Create tooltip content
        let tooltipContent = `
        <div style="color:black; padding: 8px; border-radius: 8px; max-width: 400px; font-family: Arial, sans-serif;">
            <h7 style="margin: 0 0 8px 0; color:blue">${this.IETDHPCPStations[d.station_id].name} [${d.station_id}] (${d.year})</h7>
            <p style="margin: 0 0 8px 0;"><b>PCA Position:</b> PC1=${d.x.toFixed(3)}, PC2=${d.y.toFixed(3)}</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                    <h7 style="margin: 0 0 4px 0;"><b>Annual Summary</b></h7>
                    <p style="margin: 0;">Total Precipitation: ${formatPrecip(features.totalPrecipitation)}</p>
                    <p style="margin: 0;">Event Count: ${features.eventCount}</p>
                    <p style="margin: 0;">Max Event: ${formatPrecip(features.maxVolume)}</p>
                    <p style="margin: 0;">Mean Intensity: ${features.meanIntensity.toFixed(2)}</p>
                </div>
                
                <div>
                    <h7 style="margin: 0 0 4px 0;"><b>Seasonal Distribution</b></h7>
                    <p style="margin: 0;">Winter: ${winterPct} (${features.winter.eventCount} events)</p>
                    <p style="margin: 0;">Spring: ${springPct} (${features.spring.eventCount} events)</p>
                    <p style="margin: 0;">Summer: ${summerPct} (${features.summer.eventCount} events)</p>
                    <p style="margin: 0;">Fall: ${fallPct} (${features.fall.eventCount} events)</p>
                </div>
            </div>
        </div>`;

        this.tooltip
            .html(tooltipContent)
            .style("visibility", "visible")
            .style("top", `${mouseY - 10}px`)
            .style("left", (() => {
                let leftpos = event.pageX;
                if (leftpos > this.innerWidth / 2.) {
                    leftpos = leftpos - 10 - this.tooltip.node().offsetWidth;
                } else {
                    leftpos = leftpos + 10;
                }
                return leftpos + "px";
            }));

    }


    // Update the handleMouseOut method to not hide persistent tooltips
    handleMouseOut(event, d) {
        // Only reset point style if not selected
        const pointId = `${d.station_id}-${d.year}`;
        if (!this.selectedPoints.has(pointId)) {
            // Reset point style
            d3.select(event.target)
                .attr("stroke-width", 1.5)
                .attr("stroke", d => this.stationColorScale(d.station_id))
                .attr("fill", d => this.yearColorScale(d.year));
        }

        if (this.tooltip) {
            this.tooltip.style("visibility", "hidden");
        }
    }


    resize() {
        // Check if the container is visible
        if (!this.isVisible()) return;

        // Check if the floating window is visible
        if (this.isFloatingWindowVisible()===true) return;

        // Update dimensions
        const container = d3.select(`#${this.containerId}`);
        this.width = parseInt(container.style('width'));
        this.height = parseInt(container.style('height'));

        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        // Update SVG
        this.svg
            .attr("width", this.width)
            .attr("height", this.height);

        // Update scales
        this.xScale.range([0, this.innerWidth]);
        this.yScale.range([this.innerHeight, 0]);

        // Update axes
        this.updateAxes();

        // Update existing points
        this.mainGroup.selectAll(".pca_point")
            .attr("cx", d => this.xScale(d.x))
            .attr("cy", d => this.yScale(d.y));

        // Update existing labels
        const labels = this.mainGroup.selectAll(".point-label")
            .attr("x", d => this.xScale(d.x))
            .attr("y", d => this.yScale(d.y) - 10);

        // Handle label overlapping after resize
        this.dedupeLabels('point-label');

        // Update title position
        this.mainGroup.select(".title")
            .attr("x", this.innerWidth / 2);

        // Remove and recreate legends
        d3.select(this.svg.node().parentNode).select("defs").remove(); // Remove old gradient definitions

        // Recreate Year color legend
        this.createYearColorLegend();

        // Recreate Station legend
        this.createStationLegend();
    }

    openFloatingChart(width, height) {

        this.resizeFloatingChart(width, height);

        // Enable selection functionality in the floating window
        this.enablePointSelection();
    }

    closeFloatingChart() {
        // Clear any selections before closing
        this.clearAllSelections();

        this.createSvg();
        this.createScales();
        this.createAxes();
        this.resize();

        this.redrawVisualization();

        // Disable selection functionality when returning to normal view
        this.disablePointSelection();
    }

    // Helper methods for enabling/disabling selection
    enablePointSelection() {
        this.mainGroup.selectAll(".pca_point")
            .on("click", (event, d) => {
                // Check if Ctrl key is pressed
                if (event.ctrlKey || event.metaKey) {
                    this.handlePointSelection(event, d);
                    event.stopPropagation(); // Prevent other click events
                }
            });

        // this.svg.on("click", (event) => {
        //     // Only handle if it's not a point click and Ctrl is not pressed
        //     if (!event.ctrlKey && !event.metaKey && !event.target.classList.contains('pca_point')) {
        //         this.clearAllSelections();
        //     }
        // });
    }

    disablePointSelection() {
        // Remove click handlers
        this.mainGroup.selectAll(".pca_point").on("click", null);
        this.svg.on("click", null);
    }

    resizeFloatingChart(width, height) {
        this.width = width;
        this.height = height;

        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        // Update SVG
        this.svg
            .attr("width", this.width)
            .attr("height", this.height);

        // Update scales
        this.xScale.range([0, this.innerWidth]);
        this.yScale.range([this.innerHeight, 0]);

        // Update axes
        this.updateAxes();

        // Update legend
        this.updateLegend();

        // Update labels
        this.updateLabels();

        // Update title
        this.mainGroup.select(".title")
            .attr("x", this.innerWidth / 2);

        this.redrawVisualization();

        // Add SVG click handler for deselection when clicking empty space
        // this.svg.on("click", (event) => {
        //     // Only handle if it's not a point click and Ctrl is not pressed
        //     if (!event.ctrlKey && !event.metaKey && !event.target.classList.contains('pca_point')) {
        //         this.clearAllSelections();
        //     }
        // });

        // Reattach event listeners to points with correct class selector
        this.mainGroup.selectAll(".pca_point")  // Using the correct class
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d))
            .on("click", (event, d) => {
                // Check if Ctrl key is pressed
                if (event.ctrlKey || event.metaKey) {
                    this.handlePointSelection(event, d);
                    event.stopPropagation(); // Prevent other click events
                }
            });
    }

    updateAxes() {
        this.xAxis
            .attr("transform", `translate(0, ${this.innerHeight})`)
            .call(d3.axisBottom(this.xScale));
        this.yAxis.call(d3.axisLeft(this.yScale));
    }

    updateLegend() {
        const legendY = this.innerHeight + 30;
        const spacer = 40;
        const yearLegendWidth = 150;
        const totalWidth = yearLegendWidth + spacer;
        const legendStartX = (this.innerWidth - totalWidth) / 2;

        this.mainGroup.select(".combined-legend")
            .attr("transform", `translate(${legendStartX}, ${legendY})`);
    }

    updateLabels() {
        this.mainGroup.select(".x-label")
            .attr("x", this.innerWidth - 20)
            .attr("y", this.innerHeight + 40);

        this.mainGroup.select(".y-label")
            .attr("x", -20)
            .attr("y", -45);
    }

    async updateData(newIETDData, newIETDHour) {
        this.IETDData = newIETDData;
        this.IETDhour = newIETDHour;
        this.determineYearColorScale();

        this.processData();
        this.createScales();

        this.redrawVisualization();
    }

    redrawVisualization() {
        // Clear existing elements
        this.mainGroup.selectAll(".pca_point, .point-label").remove();
        this.mainGroup.selectAll(".combined-legend").remove();
        this.mainGroup.selectAll(".year-gradient").remove(); // Remove gradient def

        // Get unique years from the data
        const uniqueYears = [...new Set(
            Object.values(this.IETDData)
                .flatMap(stationData =>
                    stationData.map(d => new Date(d.dateFrom).getFullYear())
                )
                .filter(year => !isNaN(year))
        )];

        // Check if there's only 1 year or less of data
        if (uniqueYears.length <= 1) {
            // Add message in the middle of the chart
            this.svg.append("text")
                .attr("class", "no-data-message")
                .attr("x", this.margin.left + this.innerWidth / 2)
                .attr("y", this.innerHeight / 2)
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .style("font-size", "14px")
                .style("fill", "#666")
                .text("Need at least two years of data!");

            return;
        }

        // Update axes
        this.xAxis.transition().duration(500)
            .call(d3.axisBottom(this.xScale));
        this.yAxis.transition().duration(500)
            .call(d3.axisLeft(this.yScale));

        // Flatten data for visualization while preserving station information
        const flattenedData = Object.entries(this.formattedPCAData)
            .flatMap(([station_id, data]) =>
                data.map(d => ({...d, station: station_id}))
            );

        // Update points using enter/update/exit pattern
        const points = this.mainGroup.selectAll(".pca_point")
            .data(flattenedData);

        // Enter points
        points.enter()
            .append("circle")
            .attr("class", d => `pca_point station-${d.station_id} year-${d.year}`)
            .merge(points)
            .attr("r", 3)
            .attr("fill", d => this.yearColorScale(d.year))
            .attr("stroke", d => this.stationColorScale(d.station_id))
            .attr("stroke-width", 1.5)
            .attr("cx", d => this.xScale(d.x))
            .attr("cy", d => this.yScale(d.y))
            .on("mouseover", (event, d) => this.handleMouseOver(event, d))
            .on("mouseout", (event, d) => this.handleMouseOut(event, d));

        // Update any selected points to maintain their selected state
        if (this.selectedPoints) {
            this.selectedPoints.forEach(pointId => {
                const [stationId, year] = pointId.split('-');
                this.mainGroup.selectAll(`.pca_point.station-${stationId}.year-${year}`)
                    .attr("stroke-width", 3)
                    .attr("stroke", "#FF0000") // Red outline for selected points
                    .attr("r", 5); // Slightly larger
            });
        }

        // Exit points
        points.exit().remove();

        // Update labels using enter/update/exit pattern
        const labels = this.mainGroup.selectAll(".point-label")
            .data(flattenedData);

        // Enter labels
        labels.enter()
            .append("text")
            .attr("class", d => `point-label station-${d.station_id} year-${d.year}`)
            .merge(labels)
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", d => this.stationColorScale(d.station_id))
            .attr("x", d => this.xScale(d.x))
            .attr("y", d => this.yScale(d.y) - 10)
            .style("pointer-events", "none")  // ignore mouse events on text
            .text(d => `${this.IETDHPCPStations[d.station_id].sname} (${d.year})`);

        // Exit labels
        labels.exit().remove();

        // Handle label overlapping
        this.dedupeLabels('point-label');

        // Remove existing legends and gradients
        d3.select(this.svg.node().parentNode).select("defs").remove(); // Remove old gradient definitions

        // Recreate Year color legend with new data
        this.createYearColorLegend();

        // Station legend
        this.createStationLegend();

        // Update title
        this.mainGroup.select(".title").text(this.title);
    }

    destroy() {
        try {
            // Clean up persistent tooltips
            this.persistentTooltips.forEach((tooltip) => {
                tooltip.remove();
            });
            this.persistentTooltips.clear();
            this.selectedPoints.clear();

            // Remove SVG click handler
            if (this.svg) {
                this.svg.on("click", null);
            }

            // Remove window event listener
            window.removeEventListener('resize', this.resize);

            // Get container
            const container = d3.select(`#${this.containerId}`);

            // Remove SVG and all its child elements
            container.select("svg").remove();

            // Remove tooltip
            if (this.tooltip) {
                this.tooltip.remove();
                this.tooltip = null;
            }

            // Remove specific elements
            container.selectAll(".annualpca_point").remove();
            container.selectAll(".point-label").remove();
            container.selectAll(".x.axis").remove();
            container.selectAll(".y.axis").remove();
            container.selectAll(".x-label").remove();
            container.selectAll(".y-label").remove();
            container.selectAll(".title").remove();
            container.selectAll(".no-data-message").remove();
            container.selectAll(".mainGroup").remove();

            // Remove gradient definition
            this.svg.select("defs").remove();

            // Remove all event listeners from points
            container.selectAll(".annualpca_point")
                .on("mouseover", null)
                .on("mouseout", null);

            // Clear all data references
            this.formattedData = null;
            this.IETDData = null;
            this.IETDhour = null;
            this.svg = null;
            this.mainGroup = null;
            this.tooltip = null;
            this.xScale = null;
            this.yScale = null;
            this.xAxis = null;
            this.yAxis = null;
            this.yearColorScale = null;
            this.stationColorScale = null;
            this.xExtent = null;
            this.yExtent = null;
            this.width = null;
            this.height = null;
            this.innerWidth = null;
            this.innerHeight = null;
            this.margin = null;
            this.symbolSize = null;

            // Clear matrix-related data
            this.symbolGenerators = null;
            this.projections = null;
            this.components = null;

            // Call parent's destroy method last
            super.destroy();

        } catch (error) {
            console.error('Error in destroy:', error);
        }
    }
}
