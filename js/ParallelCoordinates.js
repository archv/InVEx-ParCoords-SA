// Add spaces and a dot to the number
// '1234567.1234 -> 1 234 567.12'
function numberWithSpaces(x) {
    let parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(".");
}

// RGB color object to hex string
function rgbToHex(color) {
  return "#" + ((1 << 24) + (color.r * 255 << 16) + (color.g * 255 << 8)
      + color.b * 255).toString(16).slice(1);
}

/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 *
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 *
 * @see https://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
function getTextWidth(text, font) {
    // re-use canvas object for better performance
    let canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    let context = canvas.getContext("2d");
    context.font = font;
    let metrics = context.measureText(text);
    return metrics.width;
}



class ParallelCoordinates {
    // ********
    // Constructor
    // 
    // Passes all arguments to updateData(...)
    // ********
    constructor(element_id, dimension_names, data_array, clusters_list, clusters_color_scheme, options = {}) {
        // Save the time for debug purposes
        this._timeStart =  Date.now();


        // This function allows to jump to a certain row in a DataTable
        $.fn.dataTable.Api.register('row().show()', function () {
            let page_info = this.table().page.info(),
            // Get row index
                new_row_index = this.index(),
            // Row position
                row_position = this.table().rows()[0].indexOf(new_row_index);
            // Already on right page ?
            if (row_position >= page_info.start && row_position < page_info.end) {
                // Return row object
                return this;
            }
            // Find page number
            let page_to_display = Math.floor(row_position / this.table().page.len());
            // Go to that page
            this.table().page(page_to_display);
            // Return row object
            return this;
        });


        // This is used to manipulate d3 objects
        // e.g., to move a line on a graph to the front
        // https://github.com/wbkd/d3-extended
        d3.selection.prototype.moveToFront = function () {
            return this.each(function () {
                this.parentNode.appendChild(this);
            });
        };
        d3.selection.prototype.moveToBack = function () {
            return this.each(function () {
                let firstChild = this.parentNode.firstChild;
                if (firstChild) {
                    this.parentNode.insertBefore(this, firstChild);
                }
            });
        };


        // Ability to count a number of a certain element in an array
        if (!Array.prototype.hasOwnProperty('count'))
            Object.defineProperties(Array.prototype, {
                count: {
                    value: function (value) {
                        return this.filter(x => x == value).length;
                    }
                }
            });


        // Update data and draw the graph
        if (arguments.length > 0) 
        {
            this.updateData(element_id, dimension_names, data_array, clusters_list, clusters_color_scheme, options);

            if (this._debug)
                console.log("Parallel Coordinates creation finished in %ims", Date.now() - this._timeStart);
        }
    }

    // ********
    // Data loading function
    // 
    // Parameters:
    //  element_id - DOM id where to attach the Parallel Coordinates
    //  feature_names - array with feature names
    //  data_array - array with all data about objects under consideration
    //  clusters_list - array with all clusters in those data
    //  clusters_color_scheme - array with the color scheme
    //  aux_features - auxillary features that are not presented on the graph   -- removed
    //  aux_data_array - auxillaty data                                         -- removed
    //  options - graph options
    //
    // ********
    updateData(element_id, feature_names, data_array, clusters, clusters_color_scheme, options = {}) {
        // Save the time for debug purposes
        this._timeUpdate =  Date.now();

        // Store the new values
        this.element_id = element_id;

        // Update arrays
        this._features = feature_names;
        this._data = data_array;
        this._color = clusters;
        this._color_scheme = clusters_color_scheme;
        //this._aux_features = aux_features;
        //this._aux_data = aux_data_array;

        // Debug statistics counters
        this._search_quantity = 0;
        this._search_time = 0;
        this._search_time_min = -1;
        this._search_time_max = -1;

        // If options does not have 'draw' option, make default one
        if (!options.hasOwnProperty('draw') &&
            (typeof this.options === 'undefined' ||
                !this.options.hasOwnProperty('draw'))) {
            options.draw = {
                framework: "d3",    // Possible values: 'd3'. todo: remove 'plotly' back
                mode: "print",       // Possible values: 'print', 'cluster'
                //, first_column_name: "Clusters"    // Custom name for 'clusters' tab in the table
                parts_visible: {
                    table: true,
                    cluster_table: true,
                    hint: true,
                    selector: true,
                    table_colvis: true
                }
            };

            this.options = options;
        }
        else if (typeof this.options === 'undefined') this.options = options;
            else if (options.hasOwnProperty('draw')) this.options.draw = options.draw;

        // Throw an error if a wrong draw mode selected
        if (!["print", "cluster"].includes(this.options.draw['mode'])) 
            throw "Wrong mode value! Possible values: 'print', 'cluster', got: '"+ value + "'";

        ////// todo: options.draw.parts_visible checks
            
        // If options does not have 'skip' option, make default one
        // Default is to show 6 first lanes
        if (!options.hasOwnProperty('skip') && !this.options.hasOwnProperty('skip'))
            options.skip = {
                dims: {
                    mode: "show", // Possible values: 'hide', 'show', 'none'
                    values: this._features.slice(0,
                        (this._features.length >= 5) ? 5 : this._features.length)
                }
            };
        else if (options.hasOwnProperty('skip')) this.options.skip = options.skip;

        // todo: options.skip checks

        // Check debug settings
        if (options.hasOwnProperty('debug')) this._debug = options.debug;
            else if (!this.hasOwnProperty('_debug')) this._debug = false;

        // Initiate the arrays and draw the stuff
        this._prepareGraphAndTables();

        // Show update time when debug enabled
        if (this._debug)
            console.log("Parallel Coordinates updated in %ims (%ims from creation)",
                Date.now() - this._timeUpdate, Date.now() - this._timeStart);

        //console.log(this);
    }
    
    _prepareGraphAndTables() {
        // A link to this ParCoord object
        var _PCobject = this;

        // Clear the whole div if something is there
        $("#" + this.element_id).empty();

        // A selectBox with chosen features
        if (this.options.draw.parts_visible.selector)
            d3.select("#" + this.element_id)
                .append('p')
                    .text('Select the features displayed on the Parallel Coordinates graph:')

                    .append('select')
                        .attr({'class': 'select',
                                'id': 's' + this.element_id});

        // Construct the list with dimentions on graph
        this._graph_features = this._features.filter(elem => {
            let skip = this.options.skip;

            if (!('dims' in skip)) return true;
            if (skip['dims'].mode === 'none') return true;
            if (skip['dims'].mode === 'show' &&
                (skip['dims'].values.some(x => (x.includes(elem) || elem.includes(x))))) return true;
            return skip['dims'].mode === 'hide' &&
                !skip['dims'].values.some(x => (x.includes(elem) || elem.includes(x)));
        });

        // Reference array with all values as strings
        this._ids = this._data.map((row) => row.map(String));

        // Transposed data for future work
        this._values = this._data[0].map((col, i) => this._data.map(row => row[i]));

        // Arrays with numbers-only and string data parts
        this._features_numbers = this._features.filter((name, i) => this._values[i].every(x => !isNaN(x)));
        this._features_strings = this._features.filter((name) => !this._features_numbers.includes(name));

        // Coloring modes if clustering enabled
        if (this.options.draw.mode === "cluster")
        {
            let clusters = this._color,
                color_scheme = this._color_scheme;

            // Clusters array can be null. In this case clustering is done automatically by the 2nd column.
            if (typeof clusters === 'undefined' ||
                clusters === null ||
                clusters === [])
                clusters = this._features[1];

            // Next, if we got a string - consider it as a clustering column.
            if (typeof clusters === 'string')
                // In case we got no scematics - generate a new one.
                if (typeof color_scheme === 'undefined' ||
                    color_scheme === null ||
                    color_scheme === [])
                {
                    this._color = this._values[this._features.findIndex(x => x === clusters)];

                    /* colors: (230, 25, 75), (60, 180, 75), (0, 130, 200),
                    (245, 130, 48), (145, 30, 180), (70, 240, 240), (240, 50, 230),
                    (210, 245, 60), (250, 190, 190), (0, 128, 128), (230, 190, 255),
                    (170, 110, 40), (255, 250, 200), (128, 0, 0), (170, 255, 195),
                    (128, 128, 0), (255, 215, 180), (0, 0, 128), (255, 225, 25)*/

                    let _red = [230, 60, 0, 245, 145, 70, 240, 210, 250, 0, 230, 170, 255, 128, 170, 128, 255, 0, 255, 0],
                        _green = [25, 180, 130, 130, 30, 240, 50, 245, 190, 128, 190, 110, 250, 0, 255, 128, 215, 0, 225, 128],
                        _blue = [75, 75, 200, 48, 180, 240, 230, 60, 190, 128, 255, 40, 200, 0, 195, 0, 180, 128, 25, 64],

                        clusters_unique = [...new Set(this._color)].sort((a, b) => a - b),
                        len = clusters_unique.length;

                    this._color_scheme = {};

                    for (let i = 0; i < len; i++)
                        this._color_scheme[clusters_unique[i]] =
                            {
                                r: _red[i]/255.,
                                g: _green[i]/255.,
                                b: _blue[i]/255.
                            };
                }
        }

        // Future datatable cells (w/ color if present)
        this._cells = (this.options.draw['mode'] === "cluster") ?
            this._ids.map((x, i) => x.concat([rgbToHex(this._color_scheme[this._color[i]])])):
            this._ids;

        // Options for selectBox
        if (this.options.draw.parts_visible.selector) {
            this._selectBox = $('#s' + this.element_id).select2({
                closeOnSelect: false,
                data: this._features.map((d) => {
                    return {id: d, text: d, selected: this._graph_features.includes(d)};
                }),
                multiple: true,
                width: 'auto'
            })
            // If the list changes - redraw the graph
                .on("change.select2", () => {
                    this._graph_features = $('#s' + this.element_id).val();
                    this._createGraph();
                });

            this._selectBox.data('select2').$container.css("display", "block");
        }

        // Append an SVG to draw lines on
        let container = d3.select("#" + this.element_id)
            .append('div')
				.attr('class', 'pc-container'),
            svg_container = container.append("div")
                .attr('class', 'pc-svg-container');

        this._graph = svg_container.append("svg");

        // A hint on how to use
        if (this.options.draw.parts_visible.hint)
            svg_container
                .append('p')
                .html('Use the Left Mouse Button to select a curve and the corresponding line in the table <br>' +
                    'Hover over the lines with mouse to see the row in the table');

        // Currently selected line id
        this._selected_line = -1;

        // Add the table below the ParCoords
        if (this.options.draw.parts_visible.table)
            container
                .append("div")
                    .attr({
                        "id": "t" + this.element_id + "_wrapper-outer",
                        'class': 'pc-table-wrapper'
                    });

        // Draw the graph and the table
        this._createGraph();
        if (this.options.draw.parts_visible.table) this._createTable();

        if(this.options.draw['mode'] === 'cluster' &&
            this.options.draw.parts_visible.cluster_table){
                this._ci_div = container.append('div')
                    .attr("class", 'pc-cluster-table-wrapper');
                this._createClusterInfo();
        }

        // trash bin :)
        
        /* $("#" + element_id + ".svg")
                .tooltip({
                track: true
                });*/
        // console.log('ids', _ids);

        //console.log(_PCobject);
        //bold[0][i].attr("display", "block");
        //stroke: #0082C866;

        /*_PCobject._datatable.rows().nodes()
            .to$().removeClass('table-selected-line');*/

        return this;
    }

    // Function to draw the graph
    _createGraph() {
        // A link to this ParCoord object
        var _PCobject = this;

        // Clear the graph div if something is there
        if (this._svg !== undefined) this._svg.remove();

        // Sizes of the graph
        this._margin = { top: 30, right: 10, bottom: 10, left: 10 };
        this._width = (this._graph_features.length > 7 ? 80 * this._graph_features.length : 600) -
            this._margin.left - this._margin.right;
        this._height = 500 - this._margin.top - this._margin.bottom;

        // Change the SVG size to draw lines on
        this._graph
            .attr({"width": this._width + this._margin.left + this._margin.right,
                "height": this._height + this._margin.top + this._margin.bottom });

        // Arrays for x and y data, and brush dragging
        this._x = d3.scale.ordinal().rangePoints([0, this._width], 1);
        this._y = {};
        this._ranges = {};
        this._dragging = {};

        // Line and axis parameters, arrays with lines (gray and colored)
        this._line = d3.svg.line().interpolate("monotone");
        this._axis = d3.svg.axis().orient("left");

        // Shift the draw space
        this._svg = this._graph.append("g")
            .attr("transform", "translate(" + this._margin.left + "," + this._margin.top + ")");

        // Extract the list of dimensions and create a scale for each
        this._x.domain(this._graph_features);

        // Make scales for each feature
        this._graph_features.forEach(dim => {
            if (this._isNumbers(dim))
                this._y[dim] = d3.scale.linear()
                    .domain([Math.min(...this._values[this._features.indexOf(dim)]),
                        Math.max(...this._values[this._features.indexOf(dim)])])
                    .range([this._height, 0]);
            else {
                this._y[dim] = d3.scale.ordinal()
                    .domain(this._values[this._features.indexOf(dim)])
                    .rangePoints([this._height, 0]);
                this._ranges[dim] = this._y[dim].domain().map(this._y[dim]);
            }
        });

        // Array to make brushes
        this._line_data = this._data.map(x =>
            Object.fromEntries(this._graph_features.map(f => ([f, x[this._features.indexOf(f)]]))));

        // Grey background lines for context
        this._background = this._svg.append("g")
            .attr("class", "background")
            .selectAll("path")
            .data(this._line_data)
            .enter().append("path")
            .attr("d", this._path.bind(this));

        // Foreground lines
        this._foreground = this._svg.append("g")
            .attr("class", "foreground")
            .selectAll("path")
            .data(this._line_data)
            .enter().append("path")
            .attr("d", this._path.bind(this))

            // Cluster color scheme is applied to the stroke color 
            .attr("stroke", (d, i) => (
                (this.options.draw['mode'] === "cluster")?
                    rgbToHex(this._color_scheme[this._color[i]]):
                    "#0082C866")
                )
            .attr("stroke-opacity", "0.4")

            // When mouse is over the line, make it bold and colorful, move to the front
            // and select a correspoding line in the table below
            .on("mouseover", function (d, i) {
                if (_PCobject._selected_line !== -1) return;

                let time = Date.now();

                $(this).addClass("bold");
                d3.select(this).moveToFront();

                if (_PCobject.options.draw.parts_visible.table) {
                    let row = _PCobject._datatable.row((idx, data) => data === _PCobject._parcoordsToTable(i));

                    row.show().draw(false);
                    _PCobject._datatable.rows(row).nodes().to$().addClass('table-selected-line');
                }
                // In case of debug enabled
                // Write time to complete the search, average time, minimum and maximum
                if (_PCobject._debug)
                {
                    time = Date.now() - time;
                    _PCobject._search_time += time;
                    _PCobject._search_quantity += 1;

                    if (_PCobject._search_time_min === -1)
                    {
                        _PCobject._search_time_min = time;
                        _PCobject._search_time_max = time;
                    }

                    if (_PCobject._search_time_min > time) _PCobject._search_time_min = time;
                        else if (_PCobject._search_time_max < time) _PCobject._search_time_max = time;

                    console.log("Search completed for %ims, average: %sms [%i; %i].",
                        time, (_PCobject._search_time/_PCobject._search_quantity).toFixed(2),
                        _PCobject._search_time_min, _PCobject._search_time_max);
                }
            })

            // When mouse is away, clear the effect
            .on("mouseout", function (d, i) {
                if (_PCobject._selected_line !== -1) return;

                $(this).removeClass("bold");

                if (_PCobject.options.draw.parts_visible.table) {
                    let row = _PCobject._datatable.row((idx, data) => data === _PCobject._parcoordsToTable(i));
                    _PCobject._datatable.rows(row).nodes().to$().removeClass('table-selected-line');
                }
            })

            // Mouse click selects and deselects the line
            .on("click", function (d, i) {
                if (_PCobject._selected_line === -1) {
                    _PCobject._selected_line = i;

                    $(this).addClass("bold");
                    d3.select(this).moveToFront();

                    if (_PCobject.options.draw.parts_visible.table) {
                        let row = _PCobject._datatable.row((idx, data) => data === _PCobject._parcoordsToTable(i));

                        row.show().draw(false);
                        _PCobject._datatable.rows(row).nodes().to$().addClass('table-selected-line');
                    }
                }
                else if (_PCobject._selected_line === i) _PCobject._selected_line = -1;
            });

        // Add a group element for each dimension
        this._g = this._svg.selectAll(".dimension")
            .data(this._graph_features)
            .enter().append("g")
            .attr("class", "dimension")
            .attr("transform", function (d) { return "translate(" + _PCobject._x(d) + ")"; });
            /*.call(d3.behavior.drag()
                .origin(function (d) { return { x: this._x(d) }; }.bind(this))
                .on("dragstart", function (d) {
                    this._dragging[d] = this._x(d);
                    this._background.attr("visibility", "hidden");
                }.bind(this))
                .on("drag", function (d) {
                    this._dragging[d] = Math.min(this._width, Math.max(0, d3.event.x));
                    this._foreground.attr("d", this._path.bind(this));
                    this._graph_features.sort(function (a, b) { return this._position(a) - this._position(b); }.bind(this));
                    this._x.domain(this._graph_features);
                    this._g.attr("transform", function (d) { return "translate(" + this._position(d) + ")"; }.bind(this));
                }.bind(this))
                .on("dragend", function (d, i) {
                    delete _PCobject._dragging[d];
                    _PCobject._transition(d3.select(this)).attr("transform", "translate(" + _PCobject._x(d) + ")");
                    _PCobject._transition(_PCobject._foreground).attr("d", _PCobject._path.bind(_PCobject));
                    _PCobject._background
                        .attr("d", _PCobject._path.bind(_PCobject))
                        .transition()
                        .delay(500)
                        .duration(0)
                        .attr("visibility", null);
                   // d3.selectAll(".pc-titles-text").attr("y", (x, num) => (i % 2 == 0) ? -9 : -18);


                    /// TODO: chained append maybe?
                }));*/

        // Add an axis and titles
        this._g.append("g")
            .attr("class", "axis")
            .each(function (d) { d3.select(this).call(_PCobject._axis.scale(_PCobject._y[d])); })
            .append("text")
                .style("text-anchor", "middle")
                .attr({
                    "y": (x, num) => (num % 2 == 0) ? -9 : -18,
                    "class": "pc-titles-text"
                })
                .text((x) => x);

        // Add and store a brush for each axis
        this._g.append("g")
            .attr("class", "brush")
            .each(function (d) {
                d3.select(this).call(
                    _PCobject._y[d].brush = d3.svg.brush()
                        .y(_PCobject._y[d])
                        .on("brushstart", _PCobject._brushstart)
                        .on("brush", _PCobject._brush.bind(this, _PCobject)));
            })
            .selectAll("rect")
            .attr("x", -8)
            .attr("width", 16);
    }

    // Creates a table below the ParallelCoordinates graph
    _createTable() {
        // A link to this ParCoord object
        var _PCobject = this;
        
        // Clear the table div if something is there
        $('#t' + this.element_id + "_wrapper-outer").empty();

        // Add table to wrapper
        d3.select("#t" + this.element_id + "_wrapper-outer")
            .append("table")
                .attr({"id": "t" + this.element_id,
                        "class": "table hover"});

        // Initialize a search result with all objects visible and
        // 'visible' data array with lines on foreground (not filtered by a brush)
        this._search_results = this._ids;
        this._visible = this._ids;

        // Map headers for the tables
        this._theader = this._features.map(row => {
            return {
                title: row,

                // Add spaces and remove too much numbers after the comma
                "render": function (data, type, full) {
                    if (type === 'display' && !isNaN(data))
                        return numberWithSpaces(parseFloat(Number(data).toFixed(2)));

                    return data;
                }
            };
        });

        // Vars for table and its datatable
        this._table = $('#t' + this.element_id);
        this._datatable = this._table.DataTable({
            data: this._cells,
            columns: this._theader,

            mark: true,
            dom: 'Blfrtip',
            colReorder: true,
			stateSave: true,
            buttons: (this.options.draw.parts_visible.table_colvis)?['colvis']:[],
            "search": {"regex": true},

            // Make colors lighter for readability
            "rowCallback": (row, data) => {
                if (this.options.draw['mode'] === "cluster")
                    $(row).children().css('background', data[data.length - 1] + "33");

                $(row).children().css('white-space', 'nowrap');
            },

            // Redraw lines on ParCoords when table is ready
            "fnDrawCallback": () => {
                _PCobject._on_table_ready(_PCobject);
            }
        });

        this._fix_css_in_table('t' + this.element_id);

        // Add bold effect to lines when a line is hovered over in the table
        $(this._datatable.table().body())
            .on("mouseover", 'tr', function (d, i) {
                if (_PCobject._selected_line !== -1) return;

                let line = _PCobject._foreground[0][_PCobject._tableToParcoords(
                    _PCobject._datatable.row(this).data())];
                $(line).addClass("bold");
                d3.select(line).moveToFront();

                $(_PCobject._datatable.rows().nodes()).removeClass('table-selected-line');
                $(_PCobject._datatable.row(this).nodes()).addClass('table-selected-line');
            })
            .on("mouseout", 'tr', function (d) {
                if (_PCobject._selected_line !== -1) return;

                $(_PCobject._datatable.rows().nodes()).removeClass('table-selected-line');

                $(_PCobject._foreground[0][
                    _PCobject._tableToParcoords(_PCobject._datatable.row(this).data())
                ]).removeClass("bold");
            })

            // If the line is clicked, make it 'selected'. Remove this status on one more click.
            .on("click", 'tr', function (d, i) {
                if (_PCobject._selected_line === -1) {
                    _PCobject._selected_line = _PCobject._tableToParcoords(_PCobject._datatable.row(this).data());

                    let line = _PCobject._foreground[0][_PCobject._selected_line];
                    $(line).addClass("bold");
                    d3.select(line).moveToFront();

                    _PCobject._datatable.rows(this).nodes().to$().addClass('table-selected-line');
                }
                else if (_PCobject._selected_line === _PCobject._tableToParcoords(_PCobject._datatable.row(this).data())) {
                    let line = _PCobject._foreground[0][_PCobject._selected_line];
                    $(line).removeClass("bold");

                    _PCobject._selected_line = -1;
                    _PCobject._datatable.rows(this).nodes().to$().removeClass('table-selected-line');
                }  
            });

        // Add footer elements
        this._table.append(
            $('<tfoot/>').append($('#t' + this.element_id + ' thead tr').clone())
        );

        // Add inputs to those elements
        $('#t' + this.element_id + ' tfoot th').each(function (i, x) {
            $(this).html('<input type="text" placeholder="Search" id="t' + _PCobject.element_id + 'Input' + i + '"/>');
        });

        // Apply the search
        this._datatable.columns().every(function (i, x) {
            $('#t' + _PCobject.element_id + 'Input' + i).on('keyup change', function () {
                _PCobject._datatable
                    .columns(i)
                    .search(this.value, true)
                    .draw();
            });
        });

        // Callback for _search_results filling
        $.fn.dataTable.ext.search.push(
            function (settings, data, dataIndex, rowData, counter) {
                if (settings.sTableId !== "t" + _PCobject.element_id) return true;

                if (counter === 0) _PCobject._search_results = [];

                if (_PCobject._visible
                        .some(x => x
                            .every((y, i) =>
                                y === data[i]))) {
                    _PCobject._search_results.push(data);

                    return true;
                }
                return false;
            }
        );
    }

    // Create cluster info buttons (which call the table creation)
    _createClusterInfo() {
        // Add a div to hold a label and buttons
        this._ci_buttons_div = this._ci_div.append('div');

        // Add 'Choose Cluster' text to it
        this._ci_buttons_div
            .append('label')
                .text("Choose Cluster");

        // Add a div for the table
        this._ci_table_div = this._ci_div.append('div');

        //Add a div to hold the buttons after the label
        this._ci_buttons = this._ci_buttons_div
            .append('div')
                .attr({'class': 'ci-button-group',
                        'id': 'ci_buttons_' + this.element_id});

        let cluster_count = d3.keys(this._color_scheme).map(x => this._color.map(String).count(x)),
            scale = d3.scale.sqrt()
                .domain([Math.min(...cluster_count), Math.max(...cluster_count)])
                .range([11, 0]);

        // Add corresponding buttons to every color
        this._ci_buttons
            .selectAll("a")
                .data(d3.keys(this._color_scheme))
                .enter().append('a')
                    .attr({'class': 'ci-button',
                            'title': (id, i) => "Cluster " + id + ".\nElement count: " + cluster_count[i] + "."})
                    .style({'background': id => rgbToHex(this._color_scheme[id]),
                            'box-shadow': (id, i) => 'inset 0px 0px 0px ' + scale(cluster_count[i]) + 'px #fff'})
                    .text(id => id)
                    .on("click", id => {
                        d3.event.preventDefault();

                        // Change the layout of the menu
                        // (only if the screen is wide enough)
                        if (!window.matchMedia("(max-width: 800px)").matches) {
                            // Make the elements side by side (buttons | table)
                            this._ci_div.style('display', 'flex');

                            // Make buttons vertical
                            this._ci_buttons
                                .style({'flex-direction': 'column',
                                        'align-items': 'center'});

                            // Calculate the Number Of Columns with buttons
                            let noc = Math.ceil(Object.keys(this._color_scheme).length / 11);

                            // Fix the div with the buttons a little bit
                            this._ci_buttons_div
                                .style('width', (noc * 46) + 'px')
                                .select('label')
                                    .style('text-align', 'center');
                        }

                        // Clean all children
                        this._ci_table_div
                            .style('border', "5px dashed " + rgbToHex(this._color_scheme[id]) + "33")
                            .attr('class', 'ci-table pc-table-wrapper')
                            .html('');

                        // Add the 'selected' decoration
                        this._ci_buttons_div.selectAll('*').classed('ci-selected', false);
                        d3.select(d3.event.target).classed('ci-selected', true);

                        // Add 'Cluster # statistics' text
                        this._ci_table_div
                            .append('h3')
                                .style({'margin-bottom': '10px'})
                                .text("Cluster " + d3.event.target.innerText + " statistics");

                        // Print the stats
                        this._createClusterStatsTable();
                    });

        /*jQuery('.ci-button').tooltip({
            track: true,
            tooltipClass: "ci-tooltip",
            show: false,
            hide: false
        });*/
    }

    // Creates a table with cluster info
    // The function must be called from onClick, as it uses the d3.event.target
    _createClusterStatsTable() {
        // A link to this ParCoord object
        var _PCobject = this;

        // Make the header array
        this._ci_header = ['', "Min", "Mean", "Max", "Median", "Deviation"].map((x, i) => { return {
            title : x,
            className: (i === 0)? 'firstCol':'',

            // Add spaces and remove too much numbers after the comma
            "render": function (data, type, full) {
                if (type === 'display' && !isNaN(data))
                    return numberWithSpaces(parseFloat(Number(data).toFixed(2)));

                return data;
            }
        }});

        // Prepare data and values arrays for calculations
        this._ci_cluster_data = this._data.filter((x, i) => String(this._color[i]) === d3.event.target.innerText);
        this._ci_cluster_values = this._ci_cluster_data[0].map((col, i) => this._ci_cluster_data.map(row => row[i]));

        // Prepare table cells
        this._ci_cells = this._features.map((x, i) =>
            (this._isNumbers(x)) ?
            [
                x,
                d3.min(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                d3.mean(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                d3.max(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                d3.median(this._ci_cluster_data, row => (row[i] === null) ? 0 : row[i]),
                (this._ci_cluster_data.length > 1) ? d3.deviation(this._ci_cluster_data, row =>
                    (row[i] === null) ? 0 : row[i]) : '-'
            ] : [x + ' <i>(click to expand)</i>', '-','-','-','-','-']);

        // Calculate stats for string values
        this._ci_string_stats = this._features_strings.map((name) => [name,
            [...new Set(
                this._ci_cluster_values[
                    this._features.findIndex((x) => x === name)
                ])
            ].map(x => [x,
                this._ci_cluster_values[this._features.findIndex((x) => x === name)].count(x)])]);

        // Add 'Number of elements: N' text
        this._ci_table_div
            .append('h5')
            .style({'margin-bottom': '8px'})
            .text('Number of elements: ' + this._ci_cluster_data.length);

        // Create the table
        this._ci_table_div
            .append('table')
            .attr('id', 'ci_table_' + this.element_id);

        // Add the data to the table
        let table = $('#ci_table_' + this.element_id).DataTable({
            data: this._ci_cells,
            columns: this._ci_header,
            mark: true,
            dom: 'Alfrtip',
            colReorder: true,
            buttons: (this.options.draw.parts_visible.table)?['colvis']:[],
            "search": {"regex": true}
        });

        // Add line getting darker on mouse hover
        $(table.table().body())
            .on("mouseover", 'tr', function (d, i) {
                $(table.rows().nodes()).removeClass('table-selected-line');
                $(table.row(this).nodes()).addClass('table-selected-line');
            })
            .on("mouseout", 'tr', function (d) {
                $(table.rows().nodes()).removeClass('table-selected-line');
            })
            // Add event listener for opening and closing details
            .on('click', 'td.firstCol', function(){
                if (!this.innerText.endsWith(' (click to expand)') || _PCobject._ci_string_stats === [] ) return;

                let feature = this.innerText.replace(' (click to expand)', ''),
                    id = _PCobject._features_strings.indexOf(feature),
                    table_id = 'ci-' + _PCobject.element_id + '-' + id,
                    tr = $(this).closest('tr'),
                    row = table.row( tr ),
                    text = '<table id="' + table_id + '" class="ci_aux_table" style="width:min-content">';

                _PCobject._ci_string_stats[id][1].forEach(x => {
                    text += '<tr><td>' + x[0] + '</td><td> ' + x[1] + '</td></tr>'
                });

                text+='</table>';

                if(row.child.isShown()){
                    // This row is already open - close it
                    row.child.hide();
                    tr.removeClass('shown');
                } else {
                    // Open this row
                    row.child(text).show();
                    tr.addClass('shown');

                    let table = $('#' + table_id).DataTable({
                        columns:[
                            {title: feature},
                            {title: "Count"}
                            ],
                        dom: 't',
                        order: [[1, "desc"]]
                    });

                    $(table.table().body())
                        .on("mouseover", 'tr', function () {
                            $(table.rows().nodes()).removeClass('table-selected-line');
                            $(table.row(this).nodes()).addClass('table-selected-line');
                        })
                        .on("mouseout", 'tr', function () {
                            $(table.rows().nodes()).removeClass('table-selected-line');
                        });
                }
            });

        // Fix the css
        this._fix_css_in_table('ci_table_' + this.element_id);
    }

    // Functions to perform id transformation
    _tableToParcoords(object) { return this._cells.findIndex(x => object.every((y, i) => y === x[i])); }
    _parcoordsToTable(index) { return this._cells[index]; }

    _isNumbers(featureName) { return this._features_numbers.includes(featureName); }

    // Callback to change the lines visibility after 'draw()' completed
    _on_table_ready(object) {
        object._foreground.style("display", function (d, j) {
            return object._search_results
                    .some(x => x
                        .every((y, i) =>
                            y === object._ids[j][i]))
                ? null : "none";
        });
    }

    // Bug fixes related to css
    _fix_css_in_table(id){
        d3.select('#' + id + '_wrapper')
            .insert("div", ".dataTables_filter + *")
            .attr('class', 'pc-table-contents')
            .node()
                .appendChild(document.getElementById(id));
    }

    // Functions for lines and brushes
    _position(d) {
        let v = this._dragging[d];
        return v == null ? this._x(d) : v;
    }

    _transition(g) {
        return g.transition().duration(500);
    }

    _brushstart() {
        d3.event.sourceEvent.stopPropagation();
    }

    // Returns the path for a given data point
    _path(d) {
        return this._line(
            this._graph_features.map(
                function (p) { return [this._position(p), this._y[p](d[p])]; },
                this
            )
        );
    }

    // Handles a brush event, toggling the display of foreground lines
    _brush(object) {
        let actives = object._graph_features.filter(function (p) { return !object._y[p].brush.empty(); }),
            extents = actives.map(function (p) { return object._y[p].brush.extent(); }),
            visible = [];

        if (actives.length === 0) visible = object._ids;
        else object._foreground.each(function (d, j) {
            let isVisible = actives.every(function (p, i) {
                let value = null;

                if (!object._isNumbers(p))
                    value = object._ranges[p][object._y[p].domain().findIndex(x => x === d[p])];
                else value = d[p];

                return extents[i][0] <= value && value <= extents[i][1];
            });
            
            if (isVisible) visible.push(object._ids[j]);
        });

        object._visible = visible;
        object._datatable.draw();
    }
}